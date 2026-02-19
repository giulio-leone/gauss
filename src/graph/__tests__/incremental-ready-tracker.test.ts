import { describe, it, expect, vi } from 'vitest';
import { IncrementalReadyTracker } from '../incremental-ready-tracker.js';

describe('IncrementalReadyTracker', () => {
  it('linear chain: A→B→C', () => {
    const readyCalls: string[] = [];
    // edges: B depends on A, C depends on B
    const edges = new Map<string, readonly string[]>([
      ['A', []],
      ['B', ['A']],
      ['C', ['B']],
    ]);

    const tracker = new IncrementalReadyTracker(
      edges,
      ['A', 'B', 'C'],
      (nodeId) => readyCalls.push(nodeId),
    );

    tracker.seedInitialReady();
    expect(readyCalls).toEqual(['A']);

    const afterA = tracker.markCompleted('A');
    expect(afterA).toEqual(['B']);
    expect(readyCalls).toEqual(['A', 'B']);

    const afterB = tracker.markCompleted('B');
    expect(afterB).toEqual(['C']);
    expect(readyCalls).toEqual(['A', 'B', 'C']);

    const afterC = tracker.markCompleted('C');
    expect(afterC).toEqual([]);
  });

  it('diamond: A→B, A→C, B→D, C→D', () => {
    const readyCalls: string[] = [];
    const edges = new Map<string, readonly string[]>([
      ['A', []],
      ['B', ['A']],
      ['C', ['A']],
      ['D', ['B', 'C']],
    ]);

    const tracker = new IncrementalReadyTracker(
      edges,
      ['A', 'B', 'C', 'D'],
      (nodeId) => readyCalls.push(nodeId),
    );

    tracker.seedInitialReady();
    expect(readyCalls).toEqual(['A']);

    tracker.markCompleted('A');
    // Both B and C become ready
    expect(readyCalls).toContain('B');
    expect(readyCalls).toContain('C');

    tracker.markCompleted('B');
    // D still has C pending
    expect(readyCalls).not.toContain('D');

    tracker.markCompleted('C');
    // Now D is ready
    expect(readyCalls).toContain('D');
  });

  it('snapshot and restore', () => {
    const readyCalls: string[] = [];
    const edges = new Map<string, readonly string[]>([
      ['A', []],
      ['B', ['A']],
      ['C', ['B']],
    ]);

    const tracker = new IncrementalReadyTracker(
      edges,
      ['A', 'B', 'C'],
      (nodeId) => readyCalls.push(nodeId),
    );

    tracker.seedInitialReady();
    tracker.markCompleted('A');

    // Snapshot after A completed
    const snap = tracker.snapshot();
    expect(snap.get('A')).toBe(0);
    expect(snap.get('B')).toBe(0); // B became ready (deps=0)
    expect(snap.get('C')).toBe(1); // C still waiting on B

    // Create a new tracker and restore
    const readyCalls2: string[] = [];
    const tracker2 = new IncrementalReadyTracker(
      edges,
      ['A', 'B', 'C'],
      (nodeId) => readyCalls2.push(nodeId),
    );

    tracker2.restoreFrom(snap);

    // B should be at 0 deps, so completing B should trigger C
    const afterB = tracker2.markCompleted('B');
    expect(afterB).toEqual(['C']);
    expect(readyCalls2).toEqual(['C']);
  });

  it('multiple roots', () => {
    const readyCalls: string[] = [];
    const edges = new Map<string, readonly string[]>([
      ['A', []],
      ['B', []],
      ['C', ['A', 'B']],
    ]);

    const tracker = new IncrementalReadyTracker(
      edges,
      ['A', 'B', 'C'],
      (nodeId) => readyCalls.push(nodeId),
    );

    tracker.seedInitialReady();
    expect(readyCalls).toContain('A');
    expect(readyCalls).toContain('B');
    expect(readyCalls).not.toContain('C');

    tracker.markCompleted('A');
    expect(readyCalls).not.toContain('C');

    tracker.markCompleted('B');
    expect(readyCalls).toContain('C');
  });

  it('single node graph', () => {
    const readyCalls: string[] = [];
    const edges = new Map<string, readonly string[]>([['X', []]]);

    const tracker = new IncrementalReadyTracker(
      edges,
      ['X'],
      (nodeId) => readyCalls.push(nodeId),
    );

    tracker.seedInitialReady();
    expect(readyCalls).toEqual(['X']);
    expect(tracker.markCompleted('X')).toEqual([]);
  });
});
