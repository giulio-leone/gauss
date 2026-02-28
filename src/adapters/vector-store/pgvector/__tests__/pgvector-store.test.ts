import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgVectorStoreAdapter } from "../pgvector-store.adapter.js";

// Mock pg
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

describe("PgVectorStoreAdapter", () => {
  let adapter: PgVectorStoreAdapter;

  beforeEach(() => {
    adapter = new PgVectorStoreAdapter({
      connectionString: "postgresql://localhost:5432/test",
      dimensions: 384,
    });
  });

  it("can be instantiated with dimensions", () => {
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(PgVectorStoreAdapter);
  });

  it("implements VectorStorePort methods", () => {
    expect(typeof adapter.upsert).toBe("function");
    expect(typeof adapter.query).toBe("function");
    expect(typeof adapter.delete).toBe("function");
    expect(typeof adapter.indexStats).toBe("function");
    expect(typeof adapter.close).toBe("function");
    expect(typeof adapter.initialize).toBe("function");
  });

  it("defaults to 1536 dimensions", () => {
    const defaultAdapter = new PgVectorStoreAdapter({
      connectionString: "postgresql://localhost/test",
    });
    expect(defaultAdapter).toBeDefined();
  });

  it("initialize creates pgvector extension and table", async () => {
    await adapter.initialize();
    const pg = await import("pg");
    const mockQuery = (pg as any).__mockQuery ?? (pg as any).default?.__mockQuery;
    // Should have called CREATE EXTENSION and CREATE TABLE
    expect(mockQuery).toHaveBeenCalledTimes(3); // extension + table + index
  });

  it("indexStats returns correct stats after init", async () => {
    await adapter.initialize();
    const pg = await import("pg");
    const mockQuery = (pg as any).__mockQuery ?? (pg as any).default?.__mockQuery;
    mockQuery.mockResolvedValueOnce({ rows: [{ count: "42" }] });
    const stats = await adapter.indexStats();
    expect(stats.dimensions).toBe(384);
    expect(stats.indexType).toBe("hnsw");
  });
});
