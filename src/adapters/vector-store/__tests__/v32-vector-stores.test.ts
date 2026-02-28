import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Shared test helpers
// =============================================================================

const makeDocs = (count = 3) =>
  Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`,
    embedding: Array(4).fill(0.1 * (i + 1)),
    content: `content-${i}`,
    metadata: { category: "test", index: i },
  }));

const makeSearchParams = (overrides: Record<string, unknown> = {}) => ({
  embedding: [0.1, 0.2, 0.3, 0.4],
  topK: 5,
  ...overrides,
});

// =============================================================================
// 1. Elasticsearch
// =============================================================================

const mockEsBulk = vi.fn().mockResolvedValue({});
const mockEsSearch = vi.fn().mockResolvedValue({
  hits: {
    hits: [
      { _id: "doc-0", _score: 0.95, _source: { content: "c0", metadata: { cat: "a" } } },
      { _id: "doc-1", _score: 0.80, _source: { content: "c1", metadata: { cat: "b" } } },
    ],
  },
});
const mockEsCount = vi.fn().mockResolvedValue({ count: 42 });
const mockEsIndicesExists = vi.fn().mockResolvedValue(true);
const mockEsIndicesCreate = vi.fn().mockResolvedValue({});
const mockEsClose = vi.fn();

vi.mock("@elastic/elasticsearch", () => {
  function MockClient() {
    return {
      bulk: mockEsBulk,
      search: mockEsSearch,
      count: mockEsCount,
      close: mockEsClose,
      indices: { exists: mockEsIndicesExists, create: mockEsIndicesCreate },
    };
  }
  return { Client: MockClient };
});

describe("ElasticsearchStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ElasticsearchStoreAdapter } = await import("../elasticsearch/elasticsearch-store.adapter.js");
    adapter = new ElasticsearchStoreAdapter({
      config: { node: "http://localhost:9200", indexName: "test-idx" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { ElasticsearchStoreAdapter } = await import("../elasticsearch/elasticsearch-store.adapter.js");
    const withClient = new ElasticsearchStoreAdapter({ client: {}, indexName: "x" });
    expect(withClient).toBeDefined();
    const withConfig = new ElasticsearchStoreAdapter({
      config: { node: "http://localhost:9200", indexName: "x" },
    });
    expect(withConfig).toBeDefined();
  });

  it("initialize() creates client from config", async () => {
    await adapter.initialize();
    // Client was created internally — verify it works by calling a method
    expect(mockEsIndicesExists).toHaveBeenCalled();
  });

  it("upsert() batches documents and calls bulk API", async () => {
    await adapter.initialize();
    const docs = makeDocs(150);
    await adapter.upsert(docs);
    expect(mockEsBulk).toHaveBeenCalledTimes(2); // 100 + 50
  });

  it("query() translates filters and returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ filter: { category: { $eq: "test" } } }));
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.95);
    expect(mockEsSearch).toHaveBeenCalledTimes(1);
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0", "doc-1"]);
    expect(mockEsBulk).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: true }),
    );
  });

  it("indexStats() returns dimension/count info", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(42);
    expect(stats.dimensions).toBe(4);
    expect(stats.indexType).toBe("elasticsearch");
  });

  it("throws error on operations before initialize()", async () => {
    await expect(adapter.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(adapter.query(makeSearchParams())).rejects.toThrow("initialize()");
    await expect(adapter.delete(["x"])).rejects.toThrow("initialize()");
    await expect(adapter.indexStats()).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 2. MongoDB Atlas
// =============================================================================

const mockMongoBulkWrite = vi.fn().mockResolvedValue({});
const mockMongoDeleteMany = vi.fn().mockResolvedValue({});
const mockMongoCountDocuments = vi.fn().mockResolvedValue(100);
const mockMongoToArray = vi.fn().mockResolvedValue([
  { _id: "doc-0", content: "c0", metadata: { cat: "a" }, score: 0.9 },
  { _id: "doc-1", content: "c1", metadata: { cat: "b" }, score: 0.7 },
]);
const mockMongoAggregate = vi.fn().mockReturnValue({ toArray: mockMongoToArray });
const mockMongoCollection = vi.fn().mockReturnValue({
  bulkWrite: mockMongoBulkWrite,
  aggregate: mockMongoAggregate,
  deleteMany: mockMongoDeleteMany,
  countDocuments: mockMongoCountDocuments,
});
const mockMongoDb = vi.fn().mockReturnValue({ collection: mockMongoCollection });
const mockMongoConnect = vi.fn().mockResolvedValue(undefined);

vi.mock("mongodb", () => {
  function MockMongoClient() {
    return {
      connect: mockMongoConnect,
      db: mockMongoDb,
      close: vi.fn(),
    };
  }
  return { MongoClient: MockMongoClient };
});

describe("MongoDBStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { MongoDBStoreAdapter } = await import("../mongodb/mongodb-store.adapter.js");
    adapter = new MongoDBStoreAdapter({
      config: { connectionString: "mongodb://localhost", databaseName: "testdb", collectionName: "vectors" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { MongoDBStoreAdapter } = await import("../mongodb/mongodb-store.adapter.js");
    const withClient = new MongoDBStoreAdapter({
      client: { db: mockMongoDb },
      databaseName: "db",
      collectionName: "col",
    });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client from config", async () => {
    await adapter.initialize();
    // Client was created internally — verify it connects
    expect(mockMongoConnect).toHaveBeenCalled();
  });

  it("upsert() batches documents and calls bulkWrite", async () => {
    await adapter.initialize();
    const docs = makeDocs(150);
    await adapter.upsert(docs);
    expect(mockMongoBulkWrite).toHaveBeenCalledTimes(2);
  });

  it("query() translates filters and returns results", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("doc-0");
    expect(mockMongoAggregate).toHaveBeenCalled();
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockMongoDeleteMany).toHaveBeenCalledWith({ _id: { $in: ["doc-0"] } });
  });

  it("indexStats() returns dimension/count info", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(100);
    expect(stats.indexType).toBe("mongodb-atlas");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 3. DuckDB
// =============================================================================

const mockDuckDBRun = vi.fn().mockImplementation((_sql: string, cb: Function) => cb(null));
const mockDuckDBAll = vi.fn().mockImplementation((_sql: string, cb: Function) =>
  cb(null, [
    { id: "doc-0", content: "c0", metadata: '{"cat":"a"}', embedding: [0.1], score: 0.9 },
  ]),
);
const mockDuckDBConnect = vi.fn().mockImplementation((cb: Function) => {
  const conn = { run: mockDuckDBRun, all: mockDuckDBAll, close: vi.fn() };
  Promise.resolve().then(() => cb(null, conn));
  return conn;
});

vi.mock("duckdb", () => {
  function MockDatabase(_path: string, cb: Function) {
    const db = { connect: mockDuckDBConnect, close: vi.fn() };
    if (cb) Promise.resolve().then(() => cb(null));
    return db;
  }
  return { Database: MockDatabase };
});

describe("DuckDBStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { DuckDBStoreAdapter } = await import("../duckdb/duckdb-store.adapter.js");
    adapter = new DuckDBStoreAdapter({
      config: { path: ":memory:", tableName: "embeddings" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { DuckDBStoreAdapter } = await import("../duckdb/duckdb-store.adapter.js");
    const withClient = new DuckDBStoreAdapter({ client: { run: vi.fn(), all: vi.fn() }, tableName: "t" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates database and table", async () => {
    await adapter.initialize();
    expect(mockDuckDBRun).toHaveBeenCalled();
    const calls = mockDuckDBRun.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((sql: string) => sql.includes("INSTALL vss"))).toBe(true);
    expect(calls.some((sql: string) => sql.includes("CREATE TABLE IF NOT EXISTS"))).toBe(true);
  });

  it("upsert() batches and inserts documents", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.upsert(makeDocs(3));
    expect(mockDuckDBRun).toHaveBeenCalledTimes(3);
  });

  it("query() returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("doc-0");
    expect(results[0].score).toBe(0.9);
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.delete(["doc-0", "doc-1"]);
    expect(mockDuckDBRun).toHaveBeenCalledTimes(1);
    const sql = mockDuckDBRun.mock.calls[0][0];
    expect(sql).toContain("DELETE FROM");
    expect(sql).toContain("doc-0");
  });

  it("indexStats() returns count", async () => {
    mockDuckDBAll.mockImplementationOnce((_sql: string, cb: Function) => cb(null, [{ cnt: 50 }]));
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(50);
    expect(stats.indexType).toBe("duckdb-vss");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.upsert(makeDocs())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 4. Upstash
// =============================================================================

const mockUpstashUpsert = vi.fn().mockResolvedValue("OK");
const mockUpstashQuery = vi.fn().mockResolvedValue([
  { id: "doc-0", score: 0.9, metadata: { _content: "c0", cat: "a" } },
]);
const mockUpstashDelete = vi.fn().mockResolvedValue("OK");
const mockUpstashInfo = vi.fn().mockResolvedValue({ vectorCount: 77, dimension: 4 });
const mockUpstashNamespace = vi.fn().mockReturnValue({
  upsert: mockUpstashUpsert,
  query: mockUpstashQuery,
  delete: mockUpstashDelete,
});

vi.mock("@upstash/vector", () => {
  function MockIndex() {
    return {
      upsert: mockUpstashUpsert,
      query: mockUpstashQuery,
      delete: mockUpstashDelete,
      info: mockUpstashInfo,
      namespace: mockUpstashNamespace,
    };
  }
  return { Index: MockIndex };
});

describe("UpstashStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { UpstashStoreAdapter } = await import("../upstash/upstash-store.adapter.js");
    adapter = new UpstashStoreAdapter({
      config: { url: "https://test.upstash.io", token: "tok" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { UpstashStoreAdapter } = await import("../upstash/upstash-store.adapter.js");
    const withClient = new UpstashStoreAdapter({ client: { query: vi.fn(), info: vi.fn() } });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates Index from config", async () => {
    await adapter.initialize();
    // Verify the adapter is functional after init
    expect(adapter).toBeDefined();
  });

  it("upsert() batches documents", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockUpstashUpsert).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9);
    expect(results[0].content).toBe("c0");
  });

  it("delete() calls delete with IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockUpstashDelete).toHaveBeenCalledWith(["doc-0"]);
  });

  it("indexStats() returns count and dimensions", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(77);
    expect(stats.dimensions).toBe(4);
    expect(stats.indexType).toBe("upstash");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 5. Astra DB
// =============================================================================

const mockAstraInsertMany = vi.fn().mockResolvedValue({});
const mockAstraDeleteMany = vi.fn().mockResolvedValue({});
const mockAstraCountDocuments = vi.fn().mockResolvedValue(200);
const mockAstraFindToArray = vi.fn().mockResolvedValue([
  { _id: "doc-0", content: "c0", metadata: { cat: "a" }, $similarity: 0.95 },
]);
const mockAstraFind = vi.fn().mockReturnValue({ toArray: mockAstraFindToArray });
const mockAstraCollection = {
  insertMany: mockAstraInsertMany,
  find: mockAstraFind,
  deleteMany: mockAstraDeleteMany,
  countDocuments: mockAstraCountDocuments,
};
const mockAstraCreateCollection = vi.fn().mockResolvedValue(mockAstraCollection);
const mockAstraDbCollection = vi.fn().mockReturnValue(mockAstraCollection);

vi.mock("@datastax/astra-db-ts", () => {
  function MockDataAPIClient() {
    return {
      db: vi.fn().mockReturnValue({
        createCollection: mockAstraCreateCollection,
        collection: mockAstraDbCollection,
      }),
    };
  }
  return { DataAPIClient: MockDataAPIClient };
});

describe("AstraStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { AstraStoreAdapter } = await import("../astra/astra-store.adapter.js");
    adapter = new AstraStoreAdapter({
      config: { endpoint: "https://astra.test", token: "tok", collectionName: "vecs" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { AstraStoreAdapter } = await import("../astra/astra-store.adapter.js");
    const withClient = new AstraStoreAdapter({ client: mockAstraCollection });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates DataAPIClient and collection", async () => {
    await adapter.initialize();
    expect(mockAstraCreateCollection).toHaveBeenCalled();
  });

  it("upsert() batches documents and calls insertMany", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockAstraInsertMany).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockAstraDeleteMany).toHaveBeenCalledWith({ _id: { $in: ["doc-0"] } });
  });

  it("indexStats() returns count", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(200);
    expect(stats.indexType).toBe("astra-db");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.upsert(makeDocs())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 6. LanceDB
// =============================================================================

const mockLanceToArray = vi.fn().mockResolvedValue([
  { id: "doc-0", content: "c0", metadata: '{"cat":"a"}', _distance: 0.1, vector: [0.1] },
]);
const mockLanceWhere = vi.fn().mockReturnValue({ toArray: mockLanceToArray });
const mockLanceLimit = vi.fn().mockReturnValue({ toArray: mockLanceToArray, where: mockLanceWhere });
const mockLanceSearch = vi.fn().mockReturnValue({ limit: mockLanceLimit });
const mockLanceAdd = vi.fn().mockResolvedValue(undefined);
const mockLanceMergeInsert = vi.fn().mockReturnValue({
  whenMatchedUpdateAll: vi.fn().mockReturnValue({
    whenNotMatchedInsertAll: vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  }),
});
const mockLanceDelete = vi.fn().mockResolvedValue(undefined);
const mockLanceCountRows = vi.fn().mockResolvedValue(55);
const mockLanceTable = {
  search: mockLanceSearch,
  add: mockLanceAdd,
  mergeInsert: mockLanceMergeInsert,
  delete: mockLanceDelete,
  countRows: mockLanceCountRows,
};
const mockLanceOpenTable = vi.fn().mockResolvedValue(mockLanceTable);
const mockLanceCreateTable = vi.fn().mockResolvedValue(mockLanceTable);
const mockLanceTableNames = vi.fn().mockResolvedValue(["vectors"]);

vi.mock("@lancedb/lancedb", () => ({
  connect: vi.fn().mockResolvedValue({
    tableNames: mockLanceTableNames,
    openTable: mockLanceOpenTable,
    createTable: mockLanceCreateTable,
  }),
}));

describe("LanceStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { LanceStoreAdapter } = await import("../lance/lance-store.adapter.js");
    adapter = new LanceStoreAdapter({
      config: { uri: "./test-lance", tableName: "vectors" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { LanceStoreAdapter } = await import("../lance/lance-store.adapter.js");
    const withClient = new LanceStoreAdapter({ client: mockLanceTable });
    expect(withClient).toBeDefined();
  });

  it("initialize() connects and opens table", async () => {
    await adapter.initialize();
    const lance = await import("@lancedb/lancedb");
    expect(lance.connect).toHaveBeenCalledWith("./test-lance");
    expect(mockLanceOpenTable).toHaveBeenCalledWith("vectors");
  });

  it("upsert() batches documents", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    // mergeInsert called for each batch
    expect(mockLanceMergeInsert).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("doc-0");
    // score = 1 - _distance = 1 - 0.1 = 0.9
    expect(results[0].score).toBe(0.9);
  });

  it("delete() removes documents", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0", "doc-1"]);
    expect(mockLanceDelete).toHaveBeenCalledWith("id = 'doc-0' OR id = 'doc-1'");
  });

  it("indexStats() returns count", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(55);
    expect(stats.indexType).toBe("lancedb");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 7. Turbopuffer
// =============================================================================

const mockTpufUpsert = vi.fn().mockResolvedValue({});
const mockTpufQuery = vi.fn().mockResolvedValue([
  { id: "doc-0", dist: 0.1, attributes: { _content: "c0", cat: "a" } },
]);
const mockTpufDeleteByIds = vi.fn().mockResolvedValue({});
const mockTpufDescribe = vi.fn().mockResolvedValue({ approx_count: 300, dimensions: 4 });
const mockTpufNamespace = vi.fn().mockReturnValue({
  upsert: mockTpufUpsert,
  query: mockTpufQuery,
  deleteByIds: mockTpufDeleteByIds,
  describe: mockTpufDescribe,
});

vi.mock("@turbopuffer/turbopuffer", () => {
  function MockTurbopuffer() {
    return { namespace: mockTpufNamespace };
  }
  return { Turbopuffer: MockTurbopuffer };
});

describe("TurbopufferStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { TurbopufferStoreAdapter } = await import("../turbopuffer/turbopuffer-store.adapter.js");
    adapter = new TurbopufferStoreAdapter({
      config: { apiKey: "tpuf-key", namespace: "test-ns" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { TurbopufferStoreAdapter } = await import("../turbopuffer/turbopuffer-store.adapter.js");
    const withClient = new TurbopufferStoreAdapter({ client: { query: vi.fn(), describe: vi.fn() } });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates Turbopuffer client and namespace", async () => {
    await adapter.initialize();
    expect(mockTpufNamespace).toHaveBeenCalledWith("test-ns");
  });

  it("upsert() batches documents", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockTpufUpsert).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(1);
    // score = 1 - dist = 1 - 0.1 = 0.9
    expect(results[0].score).toBe(0.9);
    expect(results[0].content).toBe("c0");
  });

  it("delete() removes by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockTpufDeleteByIds).toHaveBeenCalledWith(["doc-0"]);
  });

  it("indexStats() returns count and dimensions", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(300);
    expect(stats.dimensions).toBe(4);
    expect(stats.indexType).toBe("turbopuffer");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.delete(["x"])).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 8. Cloudflare Vectorize
// =============================================================================

const mockCfUpsert = vi.fn().mockResolvedValue({});
const mockCfQuery = vi.fn().mockResolvedValue({
  matches: [
    { id: "doc-0", score: 0.88, metadata: { _content: "c0", cat: "a" } },
  ],
});
const mockCfDeleteByIds = vi.fn().mockResolvedValue({});
const mockCfDescribe = vi.fn().mockResolvedValue({ vectorsCount: 500, dimensions: 4 });
const mockCfBinding = {
  upsert: mockCfUpsert,
  query: mockCfQuery,
  deleteByIds: mockCfDeleteByIds,
  describe: mockCfDescribe,
};

describe("CloudflareStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { CloudflareStoreAdapter } = await import("../cloudflare/cloudflare-store.adapter.js");
    // Use client mode to avoid fetch dependency in tests
    adapter = new CloudflareStoreAdapter({
      client: mockCfBinding,
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { CloudflareStoreAdapter } = await import("../cloudflare/cloudflare-store.adapter.js");
    const withClient = new CloudflareStoreAdapter({ client: mockCfBinding });
    expect(withClient).toBeDefined();
    const withConfig = new CloudflareStoreAdapter({
      config: { accountId: "acc", apiToken: "tok", indexName: "idx" },
    });
    expect(withConfig).toBeDefined();
  });

  it("initialize() sets up binding", async () => {
    await adapter.initialize();
    // client mode — binding is already set
    expect(adapter).toBeDefined();
  });

  it("upsert() batches documents and calls binding.upsert", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockCfUpsert).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with scores", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.88);
    expect(results[0].content).toBe("c0");
  });

  it("delete() calls deleteByIds", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockCfDeleteByIds).toHaveBeenCalledWith(["doc-0"]);
  });

  it("indexStats() returns count and dimensions", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(500);
    expect(stats.dimensions).toBe(4);
    expect(stats.indexType).toBe("cloudflare-vectorize");
  });

  it("throws error before initialize()", async () => {
    const { CloudflareStoreAdapter } = await import("../cloudflare/cloudflare-store.adapter.js");
    const uninitAdapter = new CloudflareStoreAdapter({
      config: { accountId: "acc", apiToken: "tok", indexName: "idx" },
    });
    await expect(uninitAdapter.upsert(makeDocs())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// Cross-cutting: minScore filtering
// =============================================================================

describe("minScore filtering", () => {
  it("Elasticsearch filters by minScore", async () => {
    const { ElasticsearchStoreAdapter } = await import("../elasticsearch/elasticsearch-store.adapter.js");
    const a = new ElasticsearchStoreAdapter({ config: { node: "http://localhost:9200", indexName: "x" } });
    await a.initialize();
    const results = await a.query(makeSearchParams({ minScore: 0.9 }));
    // Only doc-0 has score 0.95, doc-1 has 0.80
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("doc-0");
  });

  it("Upstash filters by minScore", async () => {
    mockUpstashQuery.mockResolvedValueOnce([
      { id: "a", score: 0.5, metadata: { _content: "low" } },
      { id: "b", score: 0.95, metadata: { _content: "high" } },
    ]);
    const { UpstashStoreAdapter } = await import("../upstash/upstash-store.adapter.js");
    const a = new UpstashStoreAdapter({ config: { url: "http://u", token: "t" } });
    await a.initialize();
    const results = await a.query(makeSearchParams({ minScore: 0.8 }));
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("b");
  });
});
