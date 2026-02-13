import { defineConfig } from "tsup";

export default defineConfig([
  // Core + Node (ESM + CJS)
  {
    entry: {
      index: "src/index.ts",
      "node/index": "src/node/index.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    external: [
      "@onegenui/mcp",
      "@onegenui/providers",
      "@onegenui/jobs",
      "@supabase/supabase-js",
      "tiktoken",
      "@ai-sdk/mcp",
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
      "@onegenui/mcp",
      "@onegenui/providers",
      "@onegenui/jobs",
      "@supabase/supabase-js",
      "tiktoken",
      "@ai-sdk/mcp",
    ],
  },
]);
