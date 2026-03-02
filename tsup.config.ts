import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    agent: "src/agent.ts",
    rag: "src/rag.ts",
    orchestration: "src/orchestration.ts",
    middleware: "src/middleware.ts",
    mcp: "src/mcp.ts",
    tools: "src/tools.ts",
  },
  format: ["cjs", "esm"],
  splitting: true,
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  external: ["gauss-napi"],
});

