import { describe, it, expect, vi } from "vitest";
import { BullMQQueueAdapter } from "../bullmq-queue.adapter.js";

// Mock bullmq
vi.mock("bullmq", () => {
  class MockQueue {
    add = vi.fn().mockResolvedValue({ id: "job-1", name: "process-agent", data: { agentId: "123" } });
    getJob = vi.fn().mockResolvedValue(null);
    pause = vi.fn().mockResolvedValue(undefined);
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  }
  class MockWorker {
    close = vi.fn().mockResolvedValue(undefined);
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

describe("BullMQQueueAdapter", () => {
  it("can be instantiated with queue name", () => {
    const adapter = new BullMQQueueAdapter({ queueName: "test-queue" });
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(BullMQQueueAdapter);
  });

  it("implements QueuePort methods", () => {
    const adapter = new BullMQQueueAdapter({ queueName: "test" });
    expect(typeof adapter.add).toBe("function");
    expect(typeof adapter.process).toBe("function");
    expect(typeof adapter.getJob).toBe("function");
    expect(typeof adapter.pause).toBe("function");
    expect(typeof adapter.resume).toBe("function");
    expect(typeof adapter.close).toBe("function");
  });

  it("can add a job", async () => {
    const adapter = new BullMQQueueAdapter({
      queueName: "test",
      redisUrl: "redis://localhost:6379",
    });
    const job = await adapter.add("process-agent", { agentId: "123" });
    expect(job.id).toBe("job-1");
    expect(job.name).toBe("process-agent");
  });
});
