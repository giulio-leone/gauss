// =============================================================================
// Weaviate Vector Store Adapter — Implements VectorStorePort
// =============================================================================
//
// Requires: weaviate-client (peer dependency)
//
// Usage:
//   import { WeaviateStoreAdapter } from 'gauss'
//
//   // Option A — pass config
//   const store = new WeaviateStoreAdapter({
//     config: { scheme: 'http', host: 'localhost:8080' },
//     className: 'Documents',
//     dimensions: 1536,
//   })
//   await store.initialize()
//
//   // Option B — pass pre-configured client
//   import weaviate from 'weaviate-client'
//   const client = weaviate.client({ scheme: 'http', host: 'localhost:8080' })
//   const store = new WeaviateStoreAdapter({ client, className: 'Documents' })
//   await store.initialize()
//
// =============================================================================

import type {
  VectorStorePort,
  VectorDocument,
  VectorSearchResult,
  VectorSearchParams,
  VectorIndexStats,
  VectorFilter,
} from "../../../ports/vector-store.port.js";

export interface WeaviateStoreConfig {
  /** URL scheme (default: 'http') */
  scheme?: string;
  /** Host and port (e.g. 'localhost:8080') */
  host: string;
  /** API key for authentication */
  apiKey?: string;
}

export interface WeaviateStoreOptions {
  /** Pre-configured Weaviate client */
  client?: any;
  /** Config to create a client internally */
  config?: WeaviateStoreConfig;
  /** Weaviate class name (PascalCase required) */
  className: string;
  /** Embedding dimensions (default: 1536) */
  dimensions?: number;
  /** Auto-create schema class if not exists (default: true) */
  createClass?: boolean;
  /** Batch size for upsert (default: 100) */
  batchSize?: number;
}

export class WeaviateStoreAdapter implements VectorStorePort {
  private client: any;
  private readonly className: string;
  private readonly dimensions: number;
  private readonly batchSize: number;
  private readonly options: WeaviateStoreOptions;

  constructor(options: WeaviateStoreOptions) {
    this.options = options;
    this.className = options.className;
    this.dimensions = options.dimensions ?? 1536;
    this.batchSize = options.batchSize ?? 100;
    if (options.client) this.client = options.client;
  }

  /** Initialize — create client and optionally create class schema */
  async initialize(): Promise<void> {
    if (!this.client) {
      if (!this.options.config) {
        throw new Error("WeaviateStoreAdapter: either client or config.host is required");
      }
      const weaviate = await import("weaviate-client");
      const clientFactory = weaviate.default ?? weaviate;

      const clientConfig: Record<string, unknown> = {
        scheme: this.options.config.scheme ?? "http",
        host: this.options.config.host,
      };
      if (this.options.config.apiKey) {
        const ApiKey = (weaviate as any).ApiKey ?? (weaviate as any).default?.ApiKey;
        if (ApiKey) clientConfig.apiKey = new ApiKey(this.options.config.apiKey);
      }
      this.client = clientFactory.client(clientConfig);
    }

    if (this.options.createClass !== false) {
      try {
        const exists = await this.client.schema.classGetter().withClassName(this.className).do();
        if (!exists) throw new Error("not found");
      } catch {
        await this.client.schema.classCreator().withClass({
          class: this.className,
          vectorizer: "none",
          properties: [
            { name: "content", dataType: ["text"] },
            { name: "_docId", dataType: ["text"] },
            { name: "_metadata", dataType: ["text"] },
          ],
        }).do();
      }
    }
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) return;
    this.ensureInitialized();

    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      let batcher = this.client.batch.objectsBatcher();

      for (const doc of batch) {
        // Delete existing object with same _docId first (Weaviate upsert)
        try {
          const existing = await this.client.graphql
            .get()
            .withClassName(this.className)
            .withWhere({ path: ["_docId"], operator: "Equal", valueText: doc.id })
            .withFields("_additional { id }")
            .do();

          const objects = existing?.data?.Get?.[this.className] ?? [];
          for (const obj of objects) {
            if (obj._additional?.id) {
              await this.client.data
                .deleter()
                .withClassName(this.className)
                .withId(obj._additional.id)
                .do();
            }
          }
        } catch {
          // Ignore — object may not exist
        }

        batcher = batcher.withObject({
          class: this.className,
          properties: {
            content: doc.content,
            _docId: doc.id,
            _metadata: JSON.stringify(doc.metadata),
          },
          vector: doc.embedding,
        });
      }

      await batcher.do();
    }
  }

  async query(params: VectorSearchParams): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    let queryBuilder = this.client.graphql
      .get()
      .withClassName(this.className)
      .withNearVector({ vector: params.embedding, certainty: params.minScore })
      .withLimit(params.topK)
      .withFields("content _docId _metadata _additional { id distance certainty }");

    if (params.includeEmbeddings) {
      queryBuilder = queryBuilder.withFields(
        "content _docId _metadata _additional { id distance certainty vector }",
      );
    }

    if (params.filter) {
      queryBuilder = queryBuilder.withWhere(this.translateFilter(params.filter));
    }

    const response = await queryBuilder.do();
    const objects = response?.data?.Get?.[this.className] ?? [];

    let results: VectorSearchResult[] = objects.map((obj: any) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(obj._metadata ?? "{}");
      } catch {
        /* empty */
      }

      const score = obj._additional?.certainty ?? (1 - (obj._additional?.distance ?? 1));
      return {
        id: obj._docId ?? obj._additional?.id ?? "",
        content: obj.content ?? "",
        metadata,
        score,
        ...(params.includeEmbeddings && obj._additional?.vector
          ? { embedding: obj._additional.vector }
          : {}),
      };
    });

    if (params.minScore !== undefined) {
      results = results.filter((r) => r.score >= params.minScore!);
    }

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.ensureInitialized();

    for (const id of ids) {
      try {
        const existing = await this.client.graphql
          .get()
          .withClassName(this.className)
          .withWhere({ path: ["_docId"], operator: "Equal", valueText: id })
          .withFields("_additional { id }")
          .do();

        const objects = existing?.data?.Get?.[this.className] ?? [];
        for (const obj of objects) {
          if (obj._additional?.id) {
            await this.client.data
              .deleter()
              .withClassName(this.className)
              .withId(obj._additional.id)
              .do();
          }
        }
      } catch {
        // Ignore if not found
      }
    }
  }

  async indexStats(): Promise<VectorIndexStats> {
    this.ensureInitialized();

    const result = await this.client.graphql
      .aggregate()
      .withClassName(this.className)
      .withFields("meta { count }")
      .do();

    const count = result?.data?.Aggregate?.[this.className]?.[0]?.meta?.count ?? 0;
    return {
      totalDocuments: count,
      dimensions: this.dimensions,
      indexType: "weaviate",
    };
  }

  /** Close the client connection */
  async close(): Promise<void> {
    this.client = null;
  }

  // ─── Filter Translation ───────────────────────────────────────────────

  private translateFilter(filter: VectorFilter): Record<string, unknown> {
    if ("$and" in filter) {
      const operands = (filter as { $and: VectorFilter[] }).$and.map((f) => this.translateFilter(f));
      return { operator: "And", operands };
    }
    if ("$or" in filter) {
      const operands = (filter as { $or: VectorFilter[] }).$or.map((f) => this.translateFilter(f));
      return { operator: "Or", operands };
    }
    if ("$not" in filter) {
      return {
        operator: "Not",
        operands: [this.translateFilter((filter as { $not: VectorFilter }).$not)],
      };
    }

    const conditions: Record<string, unknown>[] = [];

    for (const [field, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        for (const [op, val] of Object.entries(condition as Record<string, unknown>)) {
          conditions.push(this.buildWeaviateCondition(field, op, val));
        }
      } else {
        conditions.push({
          path: [field],
          operator: "Equal",
          ...this.weaviateValue(condition),
        });
      }
    }

    if (conditions.length === 1) return conditions[0];
    return { operator: "And", operands: conditions };
  }

  private buildWeaviateCondition(
    field: string,
    op: string,
    val: unknown,
  ): Record<string, unknown> {
    const opMap: Record<string, string> = {
      $eq: "Equal",
      $ne: "NotEqual",
      $gt: "GreaterThan",
      $gte: "GreaterThanEqual",
      $lt: "LessThan",
      $lte: "LessThanEqual",
    };

    if (op === "$in") {
      const arr = val as unknown[];
      return {
        operator: "Or",
        operands: arr.map((v) => ({
          path: [field],
          operator: "Equal",
          ...this.weaviateValue(v),
        })),
      };
    }

    if (op === "$nin") {
      const arr = val as unknown[];
      return {
        operator: "And",
        operands: arr.map((v) => ({
          path: [field],
          operator: "NotEqual",
          ...this.weaviateValue(v),
        })),
      };
    }

    return {
      path: [field],
      operator: opMap[op] ?? "Equal",
      ...this.weaviateValue(val),
    };
  }

  private weaviateValue(val: unknown): Record<string, unknown> {
    if (typeof val === "number") {
      return Number.isInteger(val) ? { valueInt: val } : { valueNumber: val };
    }
    if (typeof val === "boolean") return { valueBoolean: val };
    return { valueText: String(val) };
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error("WeaviateStoreAdapter: call initialize() before using the adapter");
    }
  }
}
