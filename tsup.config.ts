import { defineConfig } from "tsup";

const SHARED_EXTERNALS = [
  "@giulio-leone/gaussflow-mcp",
  "@giulio-leone/gaussflow-providers",
  "@giulio-leone/gaussflow-jobs",
  "@supabase/supabase-js",
  "tiktoken",
  "@ai-sdk/mcp",
  "pg",
  "ioredis",
  "bullmq",
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
] as const;

const AI_SDK_EXTERNALS = [
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/google",
  "@ai-sdk/groq",
  "@ai-sdk/mistral",
] as const;

export default defineConfig([
  // Core + Node (ESM + CJS)
  {
    entry: {
      index: "src/index.ts",
      "node/index": "src/node/index.ts",
      "rest/index": "src/rest/index.ts",
      "plugins/index": "src/plugins/index.ts",
      "scraping/index": "src/scraping/index.ts",
      "workflow/index": "src/workflow/index.ts",
      "a2a/index": "src/a2a/index.ts",
      "testing/index": "src/testing/index.ts",
      "providers/index": "src/providers/index.ts",
      "graph/index": "src/graph/index.ts",
      "memory/index": "src/memory/index.ts",
      "rag/index": "src/rag/index.ts",
      "tools/index": "src/tools/index.ts",
      "evals/entry": "src/evals/entry.ts",
      "adapters/index": "src/adapters/index.ts",
      "schemas/index": "src/schemas/index.ts",
    },
    format: ["cjs", "esm"],
    splitting: true,
    dts: true,
    clean: true,
    sourcemap: true,
    external: [...SHARED_EXTERNALS, ...AI_SDK_EXTERNALS],
  },
  // CLI (ESM — Node.js executable, with code splitting for lazy imports)
  {
    entry: {
      "cli/index": "src/cli/index.ts",
    },
    format: ["esm"],
    splitting: true,
    dts: false,
    clean: false,
    sourcemap: true,
    external: [...SHARED_EXTERNALS, ...AI_SDK_EXTERNALS],
  },
  // Server & Node runtime (ESM only)
  {
    entry: {
      "server/index": "src/server/index.ts",
      "runtime-node": "src/runtime/node.ts",
    },
    format: ["esm"],
    splitting: true,
    dts: true,
    clean: false,
    sourcemap: true,
    external: [...SHARED_EXTERNALS],
  },
]);
