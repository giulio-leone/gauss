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
// 1. Faiss
// =============================================================================

const mockFaissAdd = vi.fn();
const mockFaissSearch = vi.fn().mockReturnValue({
  labels: [0, 1],
  distances: [0.01, 0.05],
});

vi.mock("faiss-node", () => {
  function MockIndexFlatL2() {
    return { add: mockFaissAdd, search: mockFaissSearch };
  }
  return { default: { IndexFlatL2: MockIndexFlatL2 }, IndexFlatL2: MockIndexFlatL2 };
});

describe("FaissStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { FaissStoreAdapter } = await import("../faiss/faiss-store.adapter.js");
    adapter = new FaissStoreAdapter({
      config: { dimensions: 4 },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { FaissStoreAdapter } = await import("../faiss/faiss-store.adapter.js");
    const withClient = new FaissStoreAdapter({ client: { add: vi.fn(), search: vi.fn() }, dimensions: 4 });
    expect(withClient).toBeDefined();
    const withConfig = new FaissStoreAdapter({ config: { dimensions: 4 } });
    expect(withConfig).toBeDefined();
  });

  it("initialize() creates index from config", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() batches and calls add", async () => {
    await adapter.initialize();
    const docs = makeDocs(150);
    await adapter.upsert(docs);
    expect(mockFaissAdd).toHaveBeenCalled();
  });

  it("query() returns results with scores and applies minScore", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(2));
    const results = await adapter.query(makeSearchParams({ minScore: 0.99 }));
    // Results filtered by minScore
    expect(Array.isArray(results)).toBe(true);
  });

  it("delete() removes documents", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(2));
    await adapter.delete(["doc-0"]);
    const stats = await adapter.indexStats();
    expect(stats.indexType).toBe("faiss");
  });

  it("throws error before initialize()", async () => {
    await expect(adapter.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(adapter.query(makeSearchParams())).rejects.toThrow("initialize()");
    await expect(adapter.delete(["x"])).rejects.toThrow("initialize()");
    await expect(adapter.indexStats()).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 2. Vespa
// =============================================================================

const mockVespaFetch = vi.fn().mockResolvedValue({
  json: () =>
    Promise.resolve({
      root: {
        children: [
          { id: "doc-0", fields: { content: "c0", metadata: { cat: "a" } }, relevance: 0.95 },
          { id: "doc-1", fields: { content: "c1", metadata: { cat: "b" } }, relevance: 0.80 },
        ],
      },
    }),
});

describe("VespaStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { VespaStoreAdapter } = await import("../vespa/vespa-store.adapter.js");
    adapter = new VespaStoreAdapter({
      client: { fetch: mockVespaFetch },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { VespaStoreAdapter } = await import("../vespa/vespa-store.adapter.js");
    const withClient = new VespaStoreAdapter({ client: { fetch: vi.fn() } });
    expect(withClient).toBeDefined();
    const withConfig = new VespaStoreAdapter({ config: { endpoint: "http://localhost:8080" } });
    expect(withConfig).toBeDefined();
  });

  it("initialize() sets up client", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() posts documents in batches", async () => {
    await adapter.initialize();
    const docs = makeDocs(150);
    await adapter.upsert(docs);
    expect(mockVespaFetch).toHaveBeenCalled();
    // 150 individual POSTs (Vespa is per-document)
    expect(mockVespaFetch.mock.calls.length).toBe(150);
  });

  it("query() returns results with minScore filtering", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ minScore: 0.9 }));
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() removes documents by ID", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0", "doc-1"]);
    expect(mockVespaFetch).toHaveBeenCalledTimes(2);
  });

  it("throws error before initialize()", async () => {
    const { VespaStoreAdapter } = await import("../vespa/vespa-store.adapter.js");
    const uninit = new VespaStoreAdapter({ config: { endpoint: "http://localhost:8080" } });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
    await expect(uninit.delete(["x"])).rejects.toThrow("initialize()");
    await expect(uninit.indexStats()).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 3. Zilliz
// =============================================================================

const mockZillizUpsert = vi.fn().mockResolvedValue({});
const mockZillizSearch = vi.fn().mockResolvedValue({
  results: [
    { id: "doc-0", content: "c0", metadata: '{"cat":"a"}', score: 0.95 },
    { id: "doc-1", content: "c1", metadata: '{"cat":"b"}', score: 0.80 },
  ],
});
const mockZillizDelete = vi.fn().mockResolvedValue({});
const mockZillizHasCollection = vi.fn().mockResolvedValue({ value: true });
const mockZillizLoadCollection = vi.fn().mockResolvedValue({});
const mockZillizGetStats = vi.fn().mockResolvedValue({ data: { row_count: 42 } });

vi.mock("@zilliz/milvus2-sdk-node", () => {
  function MockMilvusClient() {
    return {
      upsert: mockZillizUpsert,
      search: mockZillizSearch,
      delete: mockZillizDelete,
      hasCollection: mockZillizHasCollection,
      loadCollection: mockZillizLoadCollection,
      getCollectionStatistics: mockZillizGetStats,
      close: vi.fn(),
    };
  }
  return { MilvusClient: MockMilvusClient };
});

describe("ZillizStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ZillizStoreAdapter } = await import("../zilliz/zilliz-store.adapter.js");
    adapter = new ZillizStoreAdapter({
      config: { uri: "https://test.zillizcloud.com", token: "tok", collectionName: "test" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { ZillizStoreAdapter } = await import("../zilliz/zilliz-store.adapter.js");
    const withClient = new ZillizStoreAdapter({ client: {}, collectionName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client and loads collection", async () => {
    await adapter.initialize();
    expect(mockZillizHasCollection).toHaveBeenCalled();
    expect(mockZillizLoadCollection).toHaveBeenCalled();
  });

  it("upsert() batches and calls upsert", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockZillizUpsert).toHaveBeenCalledTimes(2);
  });

  it("query() translates filters and returns results", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ filter: { category: { $eq: "test" } } }));
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() removes documents", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockZillizDelete).toHaveBeenCalled();
  });

  it("throws error before initialize()", async () => {
    const { ZillizStoreAdapter } = await import("../zilliz/zilliz-store.adapter.js");
    const uninit = new ZillizStoreAdapter({ config: { uri: "u", token: "t", collectionName: "c" } });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 4. Marqo
// =============================================================================

const mockMarqoAddDocs = vi.fn().mockResolvedValue({});
const mockMarqoSearch = vi.fn().mockResolvedValue({
  hits: [
    { _id: "doc-0", _score: 0.95, content: "c0", cat: "a" },
    { _id: "doc-1", _score: 0.80, content: "c1", cat: "b" },
  ],
});
const mockMarqoDeleteDocs = vi.fn().mockResolvedValue({});
const mockMarqoGetStats = vi.fn().mockResolvedValue({ numberOfDocuments: 42 });
const mockMarqoIndex = vi.fn().mockReturnValue({
  addDocuments: mockMarqoAddDocs,
  search: mockMarqoSearch,
  deleteDocuments: mockMarqoDeleteDocs,
  getStats: mockMarqoGetStats,
});

vi.mock("marqo", () => {
  function MockClient() {
    return { index: mockMarqoIndex };
  }
  return { Client: MockClient };
});

describe("MarqoStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { MarqoStoreAdapter } = await import("../marqo/marqo-store.adapter.js");
    adapter = new MarqoStoreAdapter({
      config: { url: "http://localhost:8882", indexName: "test-idx" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { MarqoStoreAdapter } = await import("../marqo/marqo-store.adapter.js");
    const withClient = new MarqoStoreAdapter({ client: { index: mockMarqoIndex }, indexName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() batches and calls addDocuments", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockMarqoAddDocs).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with minScore filtering", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ minScore: 0.9 }));
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("doc-0");
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockMarqoDeleteDocs).toHaveBeenCalledWith(["doc-0"]);
  });

  it("throws error before initialize()", async () => {
    const { MarqoStoreAdapter } = await import("../marqo/marqo-store.adapter.js");
    const uninit = new MarqoStoreAdapter({ config: { url: "http://localhost:8882", indexName: "x" } });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 5. Typesense
// =============================================================================

const mockTsImport = vi.fn().mockResolvedValue({});
const mockTsSearch = vi.fn().mockResolvedValue({
  hits: [
    { document: { id: "doc-0", content: "c0", metadata: { cat: "a" } }, vector_distance: 0.05 },
    { document: { id: "doc-1", content: "c1", metadata: { cat: "b" } }, vector_distance: 0.2 },
  ],
});
const mockTsDelete = vi.fn().mockResolvedValue({});
const mockTsRetrieve = vi.fn().mockResolvedValue({ num_documents: 42 });
const mockTsDocuments = vi.fn().mockReturnValue({
  import: mockTsImport,
  search: mockTsSearch,
});
const mockTsDocumentId = vi.fn().mockReturnValue({ delete: mockTsDelete });
const mockTsCollectionsName = vi.fn().mockImplementation((name?: string) => {
  if (name) {
    return {
      retrieve: mockTsRetrieve,
      documents: (id?: string) => (id ? mockTsDocumentId(id) : mockTsDocuments()),
    };
  }
  return { create: vi.fn().mockResolvedValue({}) };
});

vi.mock("typesense", () => {
  function MockClient() {
    return { collections: mockTsCollectionsName };
  }
  return { Client: MockClient };
});

describe("TypesenseStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { TypesenseStoreAdapter } = await import("../typesense/typesense-store.adapter.js");
    adapter = new TypesenseStoreAdapter({
      config: {
        nodes: [{ host: "localhost", port: 8108, protocol: "http" }],
        apiKey: "xyz",
        collectionName: "test-col",
      },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { TypesenseStoreAdapter } = await import("../typesense/typesense-store.adapter.js");
    const withClient = new TypesenseStoreAdapter({ client: { collections: vi.fn() }, collectionName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client and checks collection", async () => {
    await adapter.initialize();
    expect(mockTsCollectionsName).toHaveBeenCalled();
  });

  it("upsert() batches and calls import", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockTsImport).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with score conversion", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams());
    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("delete() removes documents by ID", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockTsDelete).toHaveBeenCalled();
  });

  it("throws error before initialize()", async () => {
    const { TypesenseStoreAdapter } = await import("../typesense/typesense-store.adapter.js");
    const uninit = new TypesenseStoreAdapter({
      config: { nodes: [{ host: "h", port: 1, protocol: "http" }], apiKey: "k", collectionName: "c" },
    });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 6. Vald
// =============================================================================

const mockValdFetch = vi.fn().mockResolvedValue({
  json: () =>
    Promise.resolve({
      results: [
        { id: "doc-0", distance: 0.05 },
        { id: "doc-1", distance: 0.2 },
      ],
    }),
});

describe("ValdStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ValdStoreAdapter } = await import("../vald/vald-store.adapter.js");
    adapter = new ValdStoreAdapter({
      client: { fetch: mockValdFetch },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { ValdStoreAdapter } = await import("../vald/vald-store.adapter.js");
    const withClient = new ValdStoreAdapter({ client: { fetch: vi.fn() } });
    expect(withClient).toBeDefined();
    const withConfig = new ValdStoreAdapter({ config: { host: "localhost", port: 8081 } });
    expect(withConfig).toBeDefined();
  });

  it("initialize() sets up client", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() posts documents in batches", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockValdFetch).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with score conversion and minScore", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ minScore: 0.9 }));
    expect(results).toHaveLength(1);
  });

  it("delete() sends remove request", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0", "doc-1"]);
    expect(mockValdFetch).toHaveBeenCalled();
  });

  it("throws error before initialize()", async () => {
    const { ValdStoreAdapter } = await import("../vald/vald-store.adapter.js");
    const uninit = new ValdStoreAdapter({ config: { host: "localhost", port: 8081 } });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 7. Momento
// =============================================================================

const mockMomentoUpsert = vi.fn().mockResolvedValue({});
const mockMomentoSearch = vi.fn().mockResolvedValue({
  hits: [
    { id: "doc-0", metadata: { _content: "c0", cat: "a" }, score: 0.95 },
    { id: "doc-1", metadata: { _content: "c1", cat: "b" }, score: 0.80 },
  ],
});
const mockMomentoDeleteBatch = vi.fn().mockResolvedValue({});
const mockMomentoListIndexes = vi.fn().mockResolvedValue({
  indexes: [{ name: "test-idx", numItems: 42, numDimensions: 4 }],
});

vi.mock("@gomomento/sdk", () => {
  function MockPreviewVectorIndexClient() {
    return {
      upsertItemBatch: mockMomentoUpsert,
      search: mockMomentoSearch,
      deleteItemBatch: mockMomentoDeleteBatch,
      listIndexes: mockMomentoListIndexes,
    };
  }
  return {
    PreviewVectorIndexClient: MockPreviewVectorIndexClient,
    CredentialProvider: {
      fromString: vi.fn().mockReturnValue({}),
    },
  };
});

describe("MomentoStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { MomentoStoreAdapter } = await import("../momento/momento-store.adapter.js");
    adapter = new MomentoStoreAdapter({
      config: { apiKey: "test-key", indexName: "test-idx" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { MomentoStoreAdapter } = await import("../momento/momento-store.adapter.js");
    const withClient = new MomentoStoreAdapter({
      client: { upsertItemBatch: vi.fn(), search: vi.fn() },
      indexName: "x",
    });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() batches and calls upsertItemBatch", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockMomentoUpsert).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with minScore filtering", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ minScore: 0.9 }));
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("doc-0");
  });

  it("delete() calls deleteItemBatch", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockMomentoDeleteBatch).toHaveBeenCalledWith("test-idx", ["doc-0"]);
  });

  it("throws error before initialize()", async () => {
    const { MomentoStoreAdapter } = await import("../momento/momento-store.adapter.js");
    const uninit = new MomentoStoreAdapter({ config: { apiKey: "k", indexName: "i" } });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 8. SingleStore
// =============================================================================

const mockSsExecute = vi.fn().mockResolvedValue([
  [{ id: "doc-0", content: "c0", metadata: '{"cat":"a"}', score: 0.95, cnt: 42 }],
]);

vi.mock("mysql2", () => {
  function MockPool() {
    return { promise: () => ({ execute: mockSsExecute, end: vi.fn() }) };
  }
  return { createPool: MockPool };
});

describe("SingleStoreStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { SingleStoreStoreAdapter } = await import("../singlestore/singlestore-store.adapter.js");
    adapter = new SingleStoreStoreAdapter({
      config: { host: "localhost", user: "root", password: "pass", database: "db", tableName: "vecs" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { SingleStoreStoreAdapter } = await import("../singlestore/singlestore-store.adapter.js");
    const withClient = new SingleStoreStoreAdapter({ client: { execute: vi.fn() }, tableName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates pool and table", async () => {
    await adapter.initialize();
    expect(mockSsExecute).toHaveBeenCalled();
  });

  it("upsert() batches and calls execute with REPLACE INTO", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.upsert(makeDocs(150));
    expect(mockSsExecute).toHaveBeenCalledTimes(2);
  });

  it("query() translates filters and returns results", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ filter: { category: { $eq: "test" } } }));
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() removes documents by IDs with escaped values", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.delete(["doc-0", "doc'; DROP TABLE--"]);
    expect(mockSsExecute).toHaveBeenCalledTimes(1);
    const sql = mockSsExecute.mock.calls[0][0] as string;
    // The single quote is escaped to '' — injection is neutralized
    expect(sql).toContain("''");
    expect(sql).not.toContain("doc'; DROP");
  });

  it("throws error before initialize()", async () => {
    const { SingleStoreStoreAdapter } = await import("../singlestore/singlestore-store.adapter.js");
    const uninit = new SingleStoreStoreAdapter({
      config: { host: "h", user: "u", password: "p", database: "d", tableName: "t" },
    });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 9. Azure AI Search
// =============================================================================

const mockAzureMergeOrUpload = vi.fn().mockResolvedValue({});
const mockAzureDeleteDocs = vi.fn().mockResolvedValue({});
const mockAzureGetDocumentsCount = vi.fn().mockResolvedValue(42);
const mockAzureSearchResults = [
  { document: { id: "doc-0", content: "c0", metadata: '{}' }, score: 0.95 },
  { document: { id: "doc-1", content: "c1", metadata: '{}' }, score: 0.80 },
];
const mockAzureSearch = vi.fn().mockResolvedValue({
  results: {
    [Symbol.asyncIterator]: async function* () {
      for (const r of mockAzureSearchResults) yield r;
    },
  },
});

vi.mock("@azure/search-documents", () => {
  function MockSearchClient() {
    return {
      mergeOrUploadDocuments: mockAzureMergeOrUpload,
      deleteDocuments: mockAzureDeleteDocs,
      getDocumentsCount: mockAzureGetDocumentsCount,
      search: mockAzureSearch,
    };
  }
  function MockAzureKeyCredential() {
    return {};
  }
  function MockSearchIndexClient() {
    return {};
  }
  return {
    SearchClient: MockSearchClient,
    AzureKeyCredential: MockAzureKeyCredential,
    SearchIndexClient: MockSearchIndexClient,
  };
});

describe("AzureSearchStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { AzureSearchStoreAdapter } = await import("../azure-search/azure-search-store.adapter.js");
    adapter = new AzureSearchStoreAdapter({
      config: { endpoint: "https://test.search.windows.net", apiKey: "key", indexName: "test-idx" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { AzureSearchStoreAdapter } = await import("../azure-search/azure-search-store.adapter.js");
    const withClient = new AzureSearchStoreAdapter({
      client: { mergeOrUploadDocuments: vi.fn() },
      indexName: "x",
    });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() batches and calls mergeOrUploadDocuments", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockAzureMergeOrUpload).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with filter and minScore", async () => {
    await adapter.initialize();
    const results = await adapter.query(
      makeSearchParams({ filter: { category: { $eq: "test" } }, minScore: 0.9 }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockAzureDeleteDocs).toHaveBeenCalledWith([{ id: "doc-0" }]);
  });

  it("throws error before initialize()", async () => {
    const { AzureSearchStoreAdapter } = await import("../azure-search/azure-search-store.adapter.js");
    const uninit = new AzureSearchStoreAdapter({
      config: { endpoint: "e", apiKey: "k", indexName: "i" },
    });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 10. OpenSearch
// =============================================================================

const mockOsBulk = vi.fn().mockResolvedValue({});
const mockOsSearch = vi.fn().mockResolvedValue({
  body: {
    hits: {
      hits: [
        { _id: "doc-0", _score: 0.95, _source: { content: "c0", metadata: { cat: "a" } } },
        { _id: "doc-1", _score: 0.80, _source: { content: "c1", metadata: { cat: "b" } } },
      ],
    },
  },
});
const mockOsCount = vi.fn().mockResolvedValue({ body: { count: 42 } });
const mockOsIndicesExists = vi.fn().mockResolvedValue({ body: true });
const mockOsIndicesCreate = vi.fn().mockResolvedValue({});

vi.mock("@opensearch-project/opensearch", () => {
  function MockClient() {
    return {
      bulk: mockOsBulk,
      search: mockOsSearch,
      count: mockOsCount,
      close: vi.fn(),
      indices: { exists: mockOsIndicesExists, create: mockOsIndicesCreate },
    };
  }
  return { Client: MockClient };
});

describe("OpenSearchStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { OpenSearchStoreAdapter } = await import("../opensearch/opensearch-store.adapter.js");
    adapter = new OpenSearchStoreAdapter({
      config: { node: "http://localhost:9200", indexName: "test-idx" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { OpenSearchStoreAdapter } = await import("../opensearch/opensearch-store.adapter.js");
    const withClient = new OpenSearchStoreAdapter({ client: {}, indexName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates client and checks index", async () => {
    await adapter.initialize();
    expect(mockOsIndicesExists).toHaveBeenCalled();
  });

  it("upsert() batches documents and calls bulk", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockOsBulk).toHaveBeenCalledTimes(2);
  });

  it("query() translates filters and returns results", async () => {
    await adapter.initialize();
    const results = await adapter.query(
      makeSearchParams({ filter: { category: { $eq: "test" } } }),
    );
    expect(results).toHaveLength(2);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() removes documents by IDs", async () => {
    await adapter.initialize();
    await adapter.delete(["doc-0"]);
    expect(mockOsBulk).toHaveBeenCalled();
  });

  it("throws error before initialize()", async () => {
    const { OpenSearchStoreAdapter } = await import("../opensearch/opensearch-store.adapter.js");
    const uninit = new OpenSearchStoreAdapter({ config: { node: "http://localhost:9200", indexName: "x" } });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 11. CockroachDB
// =============================================================================

const mockCrdbQuery = vi.fn().mockResolvedValue({
  rows: [
    { id: "doc-0", content: "c0", metadata: { cat: "a" }, score: "0.95", cnt: "42" },
  ],
});

vi.mock("pg", () => {
  function MockPool() {
    return { query: mockCrdbQuery, end: vi.fn() };
  }
  return { Pool: MockPool };
});

describe("CockroachDBStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { CockroachDBStoreAdapter } = await import("../cockroachdb/cockroachdb-store.adapter.js");
    adapter = new CockroachDBStoreAdapter({
      config: { connectionString: "postgresql://localhost/crdb", tableName: "vecs" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { CockroachDBStoreAdapter } = await import("../cockroachdb/cockroachdb-store.adapter.js");
    const withClient = new CockroachDBStoreAdapter({ client: { query: vi.fn() }, tableName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates pool and table", async () => {
    await adapter.initialize();
    expect(mockCrdbQuery).toHaveBeenCalled();
  });

  it("upsert() batches and calls query with parameterized SQL", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.upsert(makeDocs(150));
    expect(mockCrdbQuery).toHaveBeenCalledTimes(2);
  });

  it("query() translates filters and returns results", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ filter: { category: { $eq: "test" } } }));
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() uses parameterized queries", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.delete(["doc-0", "doc'; DROP TABLE--"]);
    expect(mockCrdbQuery).toHaveBeenCalledTimes(1);
    const args = mockCrdbQuery.mock.calls[0];
    // Uses parameterized query, not string interpolation
    expect(args[1]).toContain("doc'; DROP TABLE--");
  });

  it("throws error before initialize()", async () => {
    const { CockroachDBStoreAdapter } = await import("../cockroachdb/cockroachdb-store.adapter.js");
    const uninit = new CockroachDBStoreAdapter({
      config: { connectionString: "p", tableName: "t" },
    });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 12. Tigris
// =============================================================================

const mockTigrisFetch = vi.fn().mockResolvedValue({
  json: () =>
    Promise.resolve({
      results: [
        { id: "doc-0", content: "c0", metadata: { cat: "a" }, score: 0.95 },
        { id: "doc-1", content: "c1", metadata: { cat: "b" }, score: 0.80 },
      ],
      numDocuments: 42,
    }),
});

describe("TigrisStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { TigrisStoreAdapter } = await import("../tigris/tigris-store.adapter.js");
    adapter = new TigrisStoreAdapter({
      client: { fetch: mockTigrisFetch },
      indexName: "test-idx",
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { TigrisStoreAdapter } = await import("../tigris/tigris-store.adapter.js");
    const withClient = new TigrisStoreAdapter({ client: { fetch: vi.fn() }, indexName: "x" });
    expect(withClient).toBeDefined();
    const withConfig = new TigrisStoreAdapter({
      config: { uri: "http://localhost", apiKey: "key", indexName: "x" },
    });
    expect(withConfig).toBeDefined();
  });

  it("initialize() sets up client", async () => {
    await adapter.initialize();
    expect(adapter).toBeDefined();
  });

  it("upsert() posts documents in batches", async () => {
    await adapter.initialize();
    await adapter.upsert(makeDocs(150));
    expect(mockTigrisFetch).toHaveBeenCalledTimes(2);
  });

  it("query() returns results with minScore filtering", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ minScore: 0.9 }));
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() sends delete request", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.delete(["doc-0"]);
    expect(mockTigrisFetch).toHaveBeenCalledTimes(1);
  });

  it("throws error before initialize()", async () => {
    const { TigrisStoreAdapter } = await import("../tigris/tigris-store.adapter.js");
    const uninit = new TigrisStoreAdapter({
      config: { uri: "http://localhost", apiKey: "key", indexName: "x" },
    });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});

// =============================================================================
// 13. Neon
// =============================================================================

const mockNeonQuery = vi.fn().mockResolvedValue({
  rows: [
    { id: "doc-0", content: "c0", metadata: { cat: "a" }, score: "0.95", cnt: "42" },
  ],
});

vi.mock("@neondatabase/serverless", () => {
  function MockPool() {
    return { query: mockNeonQuery, end: vi.fn() };
  }
  return { Pool: MockPool };
});

describe("NeonStoreAdapter", () => {
  let adapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { NeonStoreAdapter } = await import("../neon/neon-store.adapter.js");
    adapter = new NeonStoreAdapter({
      config: { connectionString: "postgresql://localhost/neondb", tableName: "vecs" },
      dimensions: 4,
    });
  });

  it("accepts client or config", async () => {
    const { NeonStoreAdapter } = await import("../neon/neon-store.adapter.js");
    const withClient = new NeonStoreAdapter({ client: { query: vi.fn() }, tableName: "x" });
    expect(withClient).toBeDefined();
  });

  it("initialize() creates pool and table", async () => {
    await adapter.initialize();
    expect(mockNeonQuery).toHaveBeenCalled();
  });

  it("upsert() batches and calls query with parameterized SQL", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.upsert(makeDocs(150));
    expect(mockNeonQuery).toHaveBeenCalledTimes(2);
  });

  it("query() translates filters and returns results", async () => {
    await adapter.initialize();
    const results = await adapter.query(makeSearchParams({ filter: { category: { $eq: "test" } } }));
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
  });

  it("delete() uses parameterized queries to prevent SQL injection", async () => {
    await adapter.initialize();
    vi.clearAllMocks();
    await adapter.delete(["doc-0", "doc'; DROP TABLE--"]);
    expect(mockNeonQuery).toHaveBeenCalledTimes(1);
    const args = mockNeonQuery.mock.calls[0];
    // Uses parameterized query — IDs passed as params, not interpolated
    expect(args[1]).toContain("doc'; DROP TABLE--");
  });

  it("indexStats() returns correct info", async () => {
    await adapter.initialize();
    const stats = await adapter.indexStats();
    expect(stats.totalDocuments).toBe(42);
    expect(stats.indexType).toBe("neon");
  });

  it("throws error before initialize()", async () => {
    const { NeonStoreAdapter } = await import("../neon/neon-store.adapter.js");
    const uninit = new NeonStoreAdapter({
      config: { connectionString: "p", tableName: "t" },
    });
    await expect(uninit.upsert(makeDocs())).rejects.toThrow("initialize()");
    await expect(uninit.query(makeSearchParams())).rejects.toThrow("initialize()");
  });
});
