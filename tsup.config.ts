import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/node/index.ts"],
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
  ],
});
