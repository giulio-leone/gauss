import { defineConfig } from "tsup";

const SHARED_EXTERNALS = [
  "@giulio-leone/gaussflow-mcp",
  "@giulio-leone/gaussflow-providers",
  "@giulio-leone/gaussflow-jobs",
  "@supabase/supabase-js",
  "tiktoken",
  "@ai-sdk/mcp",
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
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: [...SHARED_EXTERNALS, ...AI_SDK_EXTERNALS],
  },
  // CLI (CJS only — Node.js executable)
  {
    entry: {
      "cli/index": "src/cli/index.ts",
    },
    format: ["cjs"],
    dts: false,
    clean: false,
    sourcemap: true,
    external: [...SHARED_EXTERNALS, ...AI_SDK_EXTERNALS],
  },
  // Deno, Edge, Browser, Server (ESM only)
  {
    entry: {
      "deno/index": "src/deno/index.ts",
      "edge/index": "src/edge/index.ts",
      "browser/index": "src/browser/index.ts",
      "server/index": "src/server/index.ts",
      "runtime-node": "src/runtime/node.ts",
      "runtime-deno": "src/runtime/deno.ts",
      "runtime-edge": "src/runtime/edge.ts",
    },
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: true,
    external: [...SHARED_EXTERNALS],
  },
]);
