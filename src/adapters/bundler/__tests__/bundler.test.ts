import { describe, it, expect } from "vitest";
import { InMemoryBundler } from "../inmemory.adapter.js";

describe("InMemoryBundler", () => {
  it("bundles a single entry point", async () => {
    const bundler = new InMemoryBundler({
      "src/index.ts": 'export const hello = "world";',
    });

    const result = await bundler.bundle({
      entries: [{ entryPoint: "src/index.ts", outputPath: "dist/index.js" }],
    });

    expect(result.outputFiles).toEqual(["dist/index.js"]);
    expect(result.totalSize).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("handles multiple entries", async () => {
    const bundler = new InMemoryBundler({
      "src/a.ts": "export const a = 1;",
      "src/b.ts": "export const b = 2;",
    });

    const result = await bundler.bundle({
      entries: [
        { entryPoint: "src/a.ts", outputPath: "dist/a.js" },
        { entryPoint: "src/b.ts", outputPath: "dist/b.js" },
      ],
    });

    expect(result.outputFiles).toHaveLength(2);
    expect(result.fileSizes["dist/a.js"]).toBeGreaterThan(0);
    expect(result.fileSizes["dist/b.js"]).toBeGreaterThan(0);
  });

  it("warns on missing entry points", async () => {
    const bundler = new InMemoryBundler();

    const result = await bundler.bundle({
      entries: [{ entryPoint: "missing.ts", outputPath: "out.js" }],
    });

    expect(result.warnings).toContain("Entry not found: missing.ts");
    expect(result.outputFiles).toHaveLength(0);
  });

  it("minifies output when requested", async () => {
    const bundler = new InMemoryBundler({
      "src/index.ts": '// comment\nconst   x   =   1;\nconsole.log(  x  );',
    });

    const normal = await bundler.bundle({
      entries: [{ entryPoint: "src/index.ts", outputPath: "out.js" }],
    });
    const minified = await bundler.bundle({
      entries: [{ entryPoint: "src/index.ts", outputPath: "out.min.js" }],
      minify: true,
    });

    expect(minified.totalSize).toBeLessThan(normal.totalSize);
  });

  it("applies CJS format wrapping", async () => {
    const bundler = new InMemoryBundler({
      "index.ts": "export default 42;",
    });

    await bundler.bundle({
      entries: [{ entryPoint: "index.ts", outputPath: "out.cjs" }],
      format: "cjs",
    });

    const content = bundler.getFile("out.cjs")!;
    expect(content).toContain('"use strict"');
  });

  it("applies IIFE format wrapping", async () => {
    const bundler = new InMemoryBundler({
      "index.ts": "console.log(42);",
    });

    await bundler.bundle({
      entries: [{ entryPoint: "index.ts", outputPath: "out.iife.js" }],
      format: "iife",
    });

    const content = bundler.getFile("out.iife.js")!;
    expect(content).toContain("(function()");
    expect(content).toContain("})();");
  });

  it("analyzes bundle", async () => {
    const bundler = new InMemoryBundler({
      "a.ts": "export const a = 1;",
      "b.ts": "export const b = 2;",
    });

    const analysis = await bundler.analyze({
      entries: [
        { entryPoint: "a.ts", outputPath: "a.js" },
        { entryPoint: "b.ts", outputPath: "b.js" },
      ],
    });

    expect(analysis.totalSize).toBeGreaterThan(0);
    expect(analysis.packages).toHaveLength(2);
    const total = analysis.packages.reduce((s, p) => s + p.percentage, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("addFile + getFile round trip", async () => {
    const bundler = new InMemoryBundler();
    bundler.addFile("test.ts", "hello world");
    expect(bundler.getFile("test.ts")).toBe("hello world");
    expect(bundler.getFile("missing.ts")).toBeUndefined();
  });
});
