import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgresStorageAdapter } from "../postgres-storage.adapter.js";

// Mock pg module
vi.mock("pg", () => {
  const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const mockEnd = vi.fn();
  class MockPool {
    query = mockQuery;
    end = mockEnd;
  }
  return {
    default: { Pool: MockPool },
    Pool: MockPool,
    __mockQuery: mockQuery,
  };
});

describe("PostgresStorageAdapter", () => {
  let adapter: PostgresStorageAdapter;

  beforeEach(() => {
    adapter = new PostgresStorageAdapter({
      connectionString: "postgresql://localhost:5432/test",
    });
  });

  it("can be instantiated with connection options", () => {
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(PostgresStorageAdapter);
  });

  it("accepts custom table and schema", () => {
    const custom = new PostgresStorageAdapter({
      connectionString: "postgresql://localhost/test",
      tableName: "custom_store",
      schema: "app",
    });
    expect(custom).toBeDefined();
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

  it("initialize creates table", async () => {
    await adapter.initialize();
    // After initialize, pool is set and query was called for CREATE TABLE
    const result = await adapter.get("memory", "nonexistent");
    expect(result).toBeNull();
  });

  it("put upserts a record after initialize", async () => {
    await adapter.initialize();
    const pg = await import("pg");
    const mockQuery = (pg as any).__mockQuery ?? (pg as any).default?.__mockQuery;
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "r1", domain: "memory", data: { key: "val" }, created_at: "1000", updated_at: "1000" }],
    });
    const result = await adapter.put("memory", "r1", { key: "val" });
    expect(result.id).toBe("r1");
    expect(result.domain).toBe("memory");
  });

  it("get returns null for non-existing record", async () => {
    await adapter.initialize();
    const pg = await import("pg");
    const mockQuery = (pg as any).__mockQuery ?? (pg as any).default?.__mockQuery;
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await adapter.get("memory", "nonexistent");
    expect(result).toBeNull();
  });
});
