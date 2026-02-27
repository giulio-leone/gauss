import { describe, expect, it } from "vitest";

import type { A2ATask } from "../a2a-handler.js";
import { A2ADurableTaskQueue } from "../a2a-durable-task-queue.js";

function createTask(id: string, nowMs: number, prompt = "test"): A2ATask {
  const nowIso = new Date(nowMs).toISOString();
  return {
    id,
    status: "queued",
    prompt,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

describe("A2ADurableTaskQueue", () => {
  it("requires lease acknowledgement to complete running tasks", () => {
    let now = 0;
    const queue = new A2ADurableTaskQueue({
      now: () => now,
      idFactory: () => "lease-1",
    });

    queue.enqueue(createTask("task-1", now));

    const lease = queue.acquire("task-1", "worker-1");
    expect(lease).not.toBeNull();

    // Missing lease acknowledgement is rejected
    expect(queue.complete("task-1", "done")).toBeNull();

    const completed = queue.complete("task-1", "done", lease?.leaseId);
    expect(completed?.status).toBe("completed");
    expect(completed?.output).toBe("done");
  });

  it("retries with backoff and fails after max attempts", () => {
    let now = 0;
    let leaseCounter = 0;

    const queue = new A2ADurableTaskQueue({
      now: () => now,
      idFactory: () => `lease-${++leaseCounter}`,
      retry: {
        maxAttempts: 2,
        initialBackoffMs: 10,
        backoffMultiplier: 1,
        maxBackoffMs: 10,
        jitterRatio: 0,
      },
    });

    queue.enqueue(createTask("task-2", now));

    const lease1 = queue.acquire("task-2", "worker-1");
    expect(lease1?.attempt).toBe(1);

    const failure1 = queue.fail("task-2", "boom-1", lease1?.leaseId);
    expect(failure1?.willRetry).toBe(true);
    expect(failure1?.retryDelayMs).toBe(10);
    expect(queue.get("task-2")?.status).toBe("queued");

    // Backoff window not elapsed yet
    expect(queue.acquire("task-2", "worker-1")).toBeNull();

    now += 10;
    const lease2 = queue.acquire("task-2", "worker-1");
    expect(lease2?.attempt).toBe(2);

    const failure2 = queue.fail("task-2", "boom-2", lease2?.leaseId);
    expect(failure2?.willRetry).toBe(false);
    expect(queue.get("task-2")?.status).toBe("failed");
  });

  it("requeues on first lease expiry and fails on second expiry", () => {
    let now = 1_000;
    let leaseCounter = 0;

    const queue = new A2ADurableTaskQueue({
      now: () => now,
      idFactory: () => `lease-${++leaseCounter}`,
      leaseDurationMs: 5,
      retry: {
        maxAttempts: 2,
        initialBackoffMs: 1,
        backoffMultiplier: 1,
        maxBackoffMs: 1,
        jitterRatio: 0,
      },
    });

    queue.enqueue(createTask("task-3", now));

    const firstLease = queue.acquire("task-3", "worker-1");
    expect(firstLease).not.toBeNull();

    now += 6; // lease expires
    const afterFirstExpiry = queue.get("task-3");
    expect(afterFirstExpiry?.status).toBe("queued");
    expect(afterFirstExpiry?.error).toContain("lease expired");

    // One millisecond backoff before retry
    expect(queue.acquire("task-3", "worker-1")).toBeNull();
    now += 1;

    const secondLease = queue.acquire("task-3", "worker-1");
    expect(secondLease?.attempt).toBe(2);

    now += 6; // second lease expires and max attempts reached
    const afterSecondExpiry = queue.get("task-3");
    expect(afterSecondExpiry?.status).toBe("failed");
    expect(afterSecondExpiry?.completedAt).toBeDefined();
  });

  it("evicts terminal tasks and supports snapshot hydration", () => {
    let now = 0;
    let leaseCounter = 0;

    const queue = new A2ADurableTaskQueue({
      now: () => now,
      idFactory: () => `lease-${++leaseCounter}`,
      maxTerminalTasks: 1,
      retentionMs: 10_000,
    });

    for (const taskId of ["task-a", "task-b", "task-c"]) {
      queue.enqueue(createTask(taskId, now));
      const lease = queue.acquire(taskId, "worker-1");
      queue.complete(taskId, `done-${taskId}`, lease?.leaseId);
      now += 1;
    }

    expect(queue.list()).toHaveLength(3);

    queue.evictExpired();
    const remaining = queue.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("task-c");

    const snapshot = queue.snapshot();

    const restoredQueue = new A2ADurableTaskQueue({ now: () => now });
    restoredQueue.hydrate(snapshot);

    expect(restoredQueue.list()).toHaveLength(1);
    expect(restoredQueue.get("task-c")?.status).toBe("completed");
  });
});
