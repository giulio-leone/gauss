// =============================================================================
// 18 — ToolRegistry: searchable tool catalog with tags and examples
// =============================================================================
//
// The ToolRegistry lets you register, search, and organize tools with
// metadata like tags and usage examples. Backed by Rust core.
//
// Usage: npx tsx examples/18-tool-registry.ts

import { ToolRegistry } from "gauss-ts";

async function main(): Promise<void> {
  const registry = new ToolRegistry();

  // ── Register tools with metadata ───────────────────────────────────
  registry.add({
    name: "web_search",
    description: "Search the web for information",
    tags: ["search", "web", "retrieval"],
    examples: [
      { description: "Search for a topic", input: { query: "Rust async runtime" } },
      { description: "Search with limit", input: { query: "TypeScript generics", limit: 5 } },
    ],
  });

  registry.add({
    name: "read_file",
    description: "Read contents of a file from disk",
    tags: ["filesystem", "io", "read"],
    examples: [
      { description: "Read a config file", input: { path: "./config.json" } },
    ],
  });

  registry.add({
    name: "write_file",
    description: "Write content to a file on disk",
    tags: ["filesystem", "io", "write"],
    examples: [
      { description: "Write output", input: { path: "./out.txt", content: "Hello" }, expectedOutput: { ok: true } },
    ],
  });

  registry.add({
    name: "sql_query",
    description: "Execute a SQL query against the database",
    tags: ["database", "sql", "retrieval"],
    examples: [
      { description: "Select users", input: { query: "SELECT * FROM users LIMIT 10" } },
    ],
  });

  // ── List all tools ─────────────────────────────────────────────────
  console.log("All tools:", registry.list().map((t) => t.name));

  // ── Search by query ────────────────────────────────────────────────
  const searchResults = registry.search("file");
  console.log("\nSearch 'file':", searchResults.map((t) => `${t.name} [${t.tags}]`));

  const dbResults = registry.search("database");
  console.log("Search 'database':", dbResults.map((t) => t.name));

  // ── Filter by tag ──────────────────────────────────────────────────
  const ioTools = registry.byTag("io");
  console.log("\nTag 'io':", ioTools.map((t) => t.name));

  const retrievalTools = registry.byTag("retrieval");
  console.log("Tag 'retrieval':", retrievalTools.map((t) => t.name));

  registry.destroy();
}

main().catch(console.error);
