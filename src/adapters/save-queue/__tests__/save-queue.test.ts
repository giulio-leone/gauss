import { describe, it, expect, vi } from "vitest";
import { SaveQueue } from "../save-queue.js";

describe("SaveQueue", () => {
  it("enqueues and retrieves pending entries", () => {
    const q = new SaveQueue();
    const id = q.enqueue("s1", "todos", [{ id: 1 }]);
    expect(q.size()).toBe(1);
    const pending = q.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].sessionId).toBe("s1");
    expect(pending[0].key).toBe("todos");
  });

  it("ack removes entry", () => {
    const q = new SaveQueue();
    const id = q.enqueue("s1", "state", { step: 1 });
    expect(q.size()).toBe(1);
    q.ack(id);
    expect(q.size()).toBe(0);
  });

  it("pendingForSession filters by session", () => {
    const q = new SaveQueue();
    q.enqueue("s1", "a", 1);
    q.enqueue("s2", "b", 2);
    q.enqueue("s1", "c", 3);
    expect(q.pendingForSession("s1")).toHaveLength(2);
    expect(q.pendingForSession("s2")).toHaveLength(1);
  });

  it("flush drains all entries", async () => {
    const q = new SaveQueue();
    q.enqueue("s1", "a", 1);
    q.enqueue("s1", "b", 2);
    const drained: string[] = [];
    const result = await q.flush(async (entry) => {
      drained.push(entry.key);
    });
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(q.size()).toBe(0);
    expect(drained).toEqual(["a", "b"]);
  });

  it("flush retries on failure", async () => {
    const q = new SaveQueue({ maxRetries: 2 });
    q.enqueue("s1", "fail", "data");
    let attempt = 0;
    const result = await q.flush(async () => {
      attempt++;
      throw new Error("fail");
    });
    expect(result.failed).toBe(1);
    // Entry still in queue (1 retry < maxRetries 2)
    expect(q.size()).toBe(1);

    // Flush again — second retry
    const result2 = await q.flush(async () => {
      throw new Error("fail again");
    });
    expect(result2.errors).toHaveLength(1);
    expect(q.size()).toBe(0); // removed after max retries
  });

  it("evicts oldest when over maxSize", () => {
    const q = new SaveQueue({ maxSize: 2 });
    q.enqueue("s1", "a", 1);
    q.enqueue("s1", "b", 2);
    q.enqueue("s1", "c", 3); // evicts "a"
    expect(q.size()).toBe(2);
    const keys = q.pending().map((e) => e.key);
    expect(keys).toContain("b");
    expect(keys).toContain("c");
  });

  it("clear removes all entries", () => {
    const q = new SaveQueue();
    q.enqueue("s1", "a", 1);
    q.enqueue("s1", "b", 2);
    q.clear();
    expect(q.size()).toBe(0);
  });

  it("auto-flush calls drain periodically", async () => {
    vi.useFakeTimers();
    const q = new SaveQueue();
    const drained: string[] = [];
    q.enqueue("s1", "x", 1);
    q.startAutoFlush(async (entry) => {
      drained.push(entry.key);
    }, 100);
    await vi.advanceTimersByTimeAsync(150);
    expect(drained).toContain("x");
    q.stopAutoFlush();
    vi.useRealTimers();
  });
});
