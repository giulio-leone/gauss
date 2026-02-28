// =============================================================================
// Bundler Adapter — In-memory bundler for testing / lightweight builds
// =============================================================================

import type {
  BundlerPort,
  BundleOptions,
  BundleResult,
  BundleAnalysis,
} from "../../ports/bundler.port.js";

/**
 * In-memory bundler adapter for testing.
 * Production usage should use the esbuild or rollup adapter.
 *
 * This adapter simulates bundling by concatenating entry contents,
 * useful for testing the bundler port interface without external deps.
 */
export class InMemoryBundler implements BundlerPort {
  private files: Map<string, string>;

  constructor(files?: Record<string, string>) {
    this.files = new Map(Object.entries(files ?? {}));
  }

  /** Add or update a file in the virtual filesystem. */
  addFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  async bundle(options: BundleOptions): Promise<BundleResult> {
    const start = Date.now();
    const outputFiles: string[] = [];
    const fileSizes: Record<string, number> = {};
    let totalSize = 0;
    const warnings: string[] = [];

    for (const entry of options.entries) {
      const content = this.files.get(entry.entryPoint);
      if (!content) {
        warnings.push(`Entry not found: ${entry.entryPoint}`);
        continue;
      }

      let output = content;

      // Simulate minification
      if (options.minify) {
        output = output
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      // Simulate format wrapping
      if (options.format === "cjs") {
        output = `"use strict";\n${output}`;
      } else if (options.format === "iife") {
        output = `(function(){\n${output}\n})();`;
      }

      const size = new TextEncoder().encode(output).length;
      outputFiles.push(entry.outputPath);
      fileSizes[entry.outputPath] = size;
      totalSize += size;

      // Store output in virtual FS
      this.files.set(entry.outputPath, output);
    }

    return {
      outputFiles,
      totalSize,
      fileSizes,
      durationMs: Date.now() - start,
      warnings,
    };
  }

  async analyze(options: BundleOptions): Promise<BundleAnalysis> {
    const result = await this.bundle(options);
    return {
      totalSize: result.totalSize,
      packages: Object.entries(result.fileSizes).map(([name, size]) => ({
        name,
        size,
        percentage: result.totalSize > 0 ? (size / result.totalSize) * 100 : 0,
      })),
      duplicates: [],
    };
  }

  /** Get a file from the virtual filesystem. */
  getFile(path: string): string | undefined {
    return this.files.get(path);
  }
}
