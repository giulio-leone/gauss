import { describe, it, expect, vi } from 'vitest';
import { WorkerPool } from '../worker-pool.js';
import type { WorkerPoolEvent } from '../worker-pool.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('WorkerPool', () => {
  it('submits and completes a task', async () => {
    const pool = new WorkerPool<number, number>(
      async (input) => input * 2,
      { initialSize: 2, minSize: 1, maxSize: 4, taskTimeoutMs: 5_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
    );

    const result = await pool.submit('t1', 5);
    expect(result).toBe(10);
    await pool.drain();
  });

  it('work-stealing: fast tasks do not wait for slow tasks', async () => {
    const order: string[] = [];

    const pool = new WorkerPool<{ id: string; ms: number }, string>(
      async (input) => {
        await delay(input.ms);
        order.push(input.id);
        return input.id;
      },
      { initialSize: 2, minSize: 1, maxSize: 4, taskTimeoutMs: 5_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
    );

    const slow = pool.submit('slow', { id: 'slow', ms: 200 });
    const fast1 = pool.submit('fast1', { id: 'fast1', ms: 10 });
    const fast2 = pool.submit('fast2', { id: 'fast2', ms: 10 });

    await Promise.all([slow, fast1, fast2]);

    // fast1 and fast2 should complete before slow
    expect(order.indexOf('fast1')).toBeLessThan(order.indexOf('slow'));
    expect(order.indexOf('fast2')).toBeLessThan(order.indexOf('slow'));
    await pool.drain();
  });

  it('respects priority ordering', async () => {
    const order: string[] = [];

    // 1 worker so tasks execute sequentially from queue
    const pool = new WorkerPool<{ id: string; pri: number }, string>(
      async (input) => {
        await delay(5);
        order.push(input.id);
        return input.id;
      },
      { initialSize: 1, minSize: 1, maxSize: 1, taskTimeoutMs: 5_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 100 },
    );

    // Submit a blocker to occupy the single worker
    const blocker = pool.submit('blocker', { id: 'blocker', pri: 0 }, 0);
    // Give it a tick to start
    await delay(1);

    // Now enqueue with different priorities (lower number = higher priority)
    const lo = pool.submit('lo', { id: 'lo', pri: 10 }, 10);
    const hi = pool.submit('hi', { id: 'hi', pri: 1 }, 1);
    const mid = pool.submit('mid', { id: 'mid', pri: 5 }, 5);

    await Promise.all([blocker, lo, hi, mid]);

    // After blocker, hi (1) should come before mid (5) which comes before lo (10)
    const afterBlocker = order.slice(1);
    expect(afterBlocker).toEqual(['hi', 'mid', 'lo']);
    await pool.drain();
  });

  it('drain completes gracefully', async () => {
    const pool = new WorkerPool<number, number>(
      async (input) => {
        await delay(30);
        return input;
      },
      { initialSize: 2, minSize: 1, maxSize: 4, taskTimeoutMs: 5_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
    );

    const p1 = pool.submit('a', 1);
    const p2 = pool.submit('b', 2);

    // Start drain while tasks are running
    const drainPromise = pool.drain(5_000);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
    await drainPromise;
  });

  it('detects task timeout', async () => {
    const events: WorkerPoolEvent<number, number>[] = [];

    const pool = new WorkerPool<number, number>(
      async (input, signal) => {
        // Simulate a hung task — wait longer than timeout
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 10_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (signal.aborted) throw signal.reason;
        return input;
      },
      { initialSize: 1, minSize: 1, maxSize: 1, taskTimeoutMs: 100, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
      (e) => events.push(e),
    );

    await expect(pool.submit('hung', 42)).rejects.toThrow(/timed out/);

    const timeoutEvents = events.filter((e) => e.type === 'task:timeout');
    expect(timeoutEvents.length).toBe(1);
    await pool.drain().catch(() => {});
  });

  it('supports AbortController cancellation via drain', async () => {
    let signalAborted = false;

    const pool = new WorkerPool<number, number>(
      async (input, signal) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 5_000);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            signalAborted = true;
            reject(signal.reason);
          });
        });
        return input;
      },
      { initialSize: 1, minSize: 1, maxSize: 1, taskTimeoutMs: 10_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
    );

    // Submit a long-running task, catch its rejection so it doesn't leak
    const resultPromise = pool.submit('cancel-test', 99).catch(() => {});

    // Drain with short timeout forces abort of in-flight tasks
    await expect(pool.drain(50)).rejects.toThrow(/Drain timeout/);
    await resultPromise;

    expect(signalAborted).toBe(true);
  });

  it('reports accurate metrics', async () => {
    const pool = new WorkerPool<number, number>(
      async (input) => {
        await delay(10);
        return input * 2;
      },
      { initialSize: 2, minSize: 1, maxSize: 4, taskTimeoutMs: 5_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
    );

    await pool.submit('m1', 1);
    await pool.submit('m2', 2);
    await pool.submit('m3', 3);

    const metrics = pool.getMetrics();
    expect(metrics.totalCompleted).toBe(3);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.queueDepth).toBe(0);
    expect(metrics.latencyP50Ms).toBeGreaterThanOrEqual(0);
    expect(metrics.workStealCount).toBeGreaterThanOrEqual(3);
    await pool.drain();
  });

  it('rejects submit after drain starts', async () => {
    const pool = new WorkerPool<number, number>(
      async (input) => input,
      { initialSize: 1, minSize: 1, maxSize: 1, taskTimeoutMs: 5_000, heartbeatIntervalMs: 60_000, idleShrinkMs: 60_000, growThreshold: 10 },
    );

    const drainP = pool.drain();
    expect(() => pool.submit('late', 1)).toThrow(/draining/);
    await drainP;
  });
});
