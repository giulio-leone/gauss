// =============================================================================
// Bundler Port — Code bundling contract for deployment packaging
// =============================================================================

export interface BundleEntry {
  /** Entry point file path */
  entryPoint: string;
  /** Output file path */
  outputPath: string;
}

export interface BundleOptions {
  /** Entry points to bundle */
  entries: BundleEntry[];
  /** Target platform */
  platform?: "node" | "browser" | "neutral";
  /** Output format */
  format?: "esm" | "cjs" | "iife";
  /** Minify output (default: true for production) */
  minify?: boolean;
  /** Generate source maps (default: true) */
  sourcemap?: boolean;
  /** External packages (not bundled) */
  external?: string[];
  /** Target ES version (e.g., "es2022") */
  target?: string;
  /** Additional loader mappings */
  loaders?: Record<string, string>;
  /** Environment variable defines */
  define?: Record<string, string>;
  /** Bundle metafile for analysis */
  metafile?: boolean;
}

export interface BundleResult {
  /** Output file paths */
  outputFiles: string[];
  /** Total bundle size in bytes */
  totalSize: number;
  /** Individual file sizes */
  fileSizes: Record<string, number>;
  /** Build duration in ms */
  durationMs: number;
  /** Warnings */
  warnings: string[];
  /** Metafile for bundle analysis (if requested) */
  metafile?: unknown;
}

export interface BundlerPort {
  /** Bundle the project according to options. */
  bundle(options: BundleOptions): Promise<BundleResult>;
  /** Analyze bundle and return dependency tree. */
  analyze?(options: BundleOptions): Promise<BundleAnalysis>;
}

export interface BundleAnalysis {
  /** Total size in bytes */
  totalSize: number;
  /** Size breakdown by package */
  packages: Array<{ name: string; size: number; percentage: number }>;
  /** Duplicate packages detected */
  duplicates: string[];
}
