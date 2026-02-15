import { defineConfig } from "tsup";

export default defineConfig([
  // Core + Node (ESM + CJS)
  {
    entry: {
      index: "src/index.ts",
      "node/index": "src/node/index.ts",
      "rest/index": "src/rest/index.ts",
      "plugins/index": "src/plugins/index.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: [
      "@giulio-leone/gaussflow-mcp",
      "@giulio-leone/gaussflow-providers",
      "@giulio-leone/gaussflow-jobs",
      "@supabase/supabase-js",
      "tiktoken",
      "@ai-sdk/mcp",
      "@ai-sdk/openai",
      "@ai-sdk/anthropic",
      "@ai-sdk/google",
      "@ai-sdk/groq",
      "@ai-sdk/mistral",
    ],
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
    external: [
      "@giulio-leone/gaussflow-mcp",
      "@giulio-leone/gaussflow-providers",
      "@giulio-leone/gaussflow-jobs",
      "@supabase/supabase-js",
      "tiktoken",
      "@ai-sdk/mcp",
      "@ai-sdk/openai",
      "@ai-sdk/anthropic",
      "@ai-sdk/google",
      "@ai-sdk/groq",
      "@ai-sdk/mistral",
    ],
  },
  // Deno, Edge, Browser, Server (ESM only)
  {
    entry: {
      "deno/index": "src/deno/index.ts",
      "edge/index": "src/edge/index.ts",
      "browser/index": "src/browser/index.ts",
      "server/index": "src/server/index.ts",
    },
    format: ["esm"],
    dts: true,
    clean: false,
    sourcemap: true,
    external: [
      "@giulio-leone/gaussflow-mcp",
      "@giulio-leone/gaussflow-providers",
      "@giulio-leone/gaussflow-jobs",
      "@supabase/supabase-js",
      "tiktoken",
      "@ai-sdk/mcp",
    ],
  },
]);
