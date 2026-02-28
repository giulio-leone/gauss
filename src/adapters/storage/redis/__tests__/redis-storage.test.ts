import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisStorageAdapter } from "../redis-storage.adapter.js";

// Mock ioredis
vi.mock("ioredis", () => {
  const mockClient = {
    set: vi.fn().mockResolvedValue("OK"),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    sadd: vi.fn().mockResolvedValue(1),
    srem: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    scard: vi.fn().mockResolvedValue(0),
    mget: vi.fn().mockResolvedValue([]),
    pipeline: vi.fn(() => ({
      set: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      srem: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 1], [null, 1]]),
    })),
    quit: vi.fn().mockResolvedValue("OK"),
  };
  class MockRedis {
    constructor() { Object.assign(this, mockClient); }
  }
  return { default: MockRedis };
});

describe("RedisStorageAdapter", () => {
  let adapter: RedisStorageAdapter;

  beforeEach(() => {
    adapter = new RedisStorageAdapter({ url: "redis://localhost:6379" });
  });

  it("can be instantiated", () => {
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(RedisStorageAdapter);
  });

  it("implements StorageDomainPort methods", () => {
    expect(typeof adapter.put).toBe("function");
    expect(typeof adapter.get).toBe("function");
    expect(typeof adapter.delete).toBe("function");
    expect(typeof adapter.query).toBe("function");
    expect(typeof adapter.count).toBe("function");
    expect(typeof adapter.clear).toBe("function");
    expect(typeof adapter.close).toBe("function");
    expect(typeof adapter.initialize).toBe("function");
  });

  it("uses custom prefix", () => {
    const custom = new RedisStorageAdapter({ prefix: "myapp" });
    expect(custom).toBeDefined();
  });

  it("initialize creates Redis client", async () => {
    await adapter.initialize();
    // After initialize, count should work
    const count = await adapter.count("agents");
    expect(count).toBe(0);
  });

  it("count returns 0 for empty domain", async () => {
    await adapter.initialize();
    const count = await adapter.count("memory");
    expect(count).toBe(0);
  });
});
