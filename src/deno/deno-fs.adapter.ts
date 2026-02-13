// =============================================================================
// DenoFilesystem — Sandboxed wrapper over Deno filesystem APIs
// =============================================================================

import type { FilesystemPort } from "../ports/filesystem.port.js";
import type {
  FileEntry,
  FileStat,
  FilesystemZone,
  ListOptions,
  SearchOptions,
  SearchResult,
} from "../types.js";
import { globToRegex } from "../adapters/filesystem/glob-utils.js";

// -----------------------------------------------------------------------------
// Minimal Deno API type declarations for cross-compilation
// -----------------------------------------------------------------------------

interface DenoStatResult {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: Date | null;
  birthtime: Date | null;
}

interface DenoDirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

interface DenoFsApi {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  stat(path: string): Promise<DenoStatResult>;
  readDir(path: string): AsyncIterable<DenoDirEntry>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
}

function getDeno(): DenoFsApi {
  const d = (globalThis as Record<string, unknown>).Deno as
    | DenoFsApi
    | undefined;
  if (!d) throw new Error("DenoFilesystem requires the Deno runtime");
  return d;
}

// -----------------------------------------------------------------------------
// Path helpers (posix-only, no node: imports)
// -----------------------------------------------------------------------------

function join(...parts: string[]): string {
  return parts
    .join("/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

function resolve(...parts: string[]): string {
  let resolved = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const segment = parts[i]!;
    resolved = segment + (resolved ? "/" + resolved : "");
    if (segment.startsWith("/")) break;
  }
  // Normalise "." and ".." segments
  const segments = resolved.split("/");
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "..") stack.pop();
    else if (seg !== "." && seg !== "") stack.push(seg);
  }
  return "/" + stack.join("/");
}

function relative(from: string, to: string): string {
  const fromParts = from.split("/").filter(Boolean);
  const toParts = to.split("/").filter(Boolean);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }
  const ups = fromParts.length - common;
  const remaining = toParts.slice(common);
  const result = [...Array(ups).fill(".."), ...remaining].join("/");
  return result || ".";
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Sandboxed filesystem adapter for the Deno runtime.
 * Mirrors LocalFilesystem behaviour using Deno.* namespace APIs.
 */
export class DenoFilesystem implements FilesystemPort {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = resolve(basePath);
  }

  // -- Core CRUD --------------------------------------------------------------

  async read(
    path: string,
    zone: FilesystemZone = "transient",
  ): Promise<string> {
    return getDeno().readTextFile(this.resolvePath(path, zone));
  }

  async write(
    path: string,
    content: string,
    zone: FilesystemZone = "transient",
  ): Promise<void> {
    const fullPath = this.resolvePath(path, zone);
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await getDeno().mkdir(parentDir, { recursive: true });
    await getDeno().writeTextFile(fullPath, content);
  }

  async exists(
    path: string,
    zone: FilesystemZone = "transient",
  ): Promise<boolean> {
    try {
      await getDeno().stat(this.resolvePath(path, zone));
      return true;
    } catch {
      return false;
    }
  }

  async delete(
    path: string,
    zone: FilesystemZone = "transient",
  ): Promise<void> {
    try {
      await getDeno().remove(this.resolvePath(path, zone), { recursive: true });
    } catch {
      // Ignore missing files (match Node rm force behaviour)
    }
  }

  // -- Listing ----------------------------------------------------------------

  async list(
    path: string,
    options: ListOptions = {},
    zone: FilesystemZone = "transient",
  ): Promise<FileEntry[]> {
    const fullPath = this.resolvePath(path, zone);
    return this.readEntries(fullPath, fullPath, options, 1);
  }

  // -- Stat -------------------------------------------------------------------

  async stat(
    path: string,
    zone: FilesystemZone = "transient",
  ): Promise<FileStat> {
    const s = await getDeno().stat(this.resolvePath(path, zone));
    return {
      size: s.size,
      isDirectory: s.isDirectory,
      isFile: s.isFile,
      createdAt: s.birthtime ? s.birthtime.getTime() : 0,
      modifiedAt: s.mtime ? s.mtime.getTime() : 0,
    };
  }

  // -- Glob -------------------------------------------------------------------

  async glob(
    pattern: string,
    zone: FilesystemZone = "transient",
  ): Promise<string[]> {
    const zoneRoot = this.zoneRoot(zone);
    const allFiles = await this.collectFiles(zoneRoot);
    const regex = globToRegex(pattern);
    return allFiles
      .map((f) => relative(zoneRoot, f))
      .filter((f) => regex.test(f));
  }

  // -- Search -----------------------------------------------------------------

  async search(
    pattern: string,
    options: SearchOptions = {},
    zone: FilesystemZone = "transient",
  ): Promise<SearchResult[]> {
    const deno = getDeno();
    const zoneRoot = this.zoneRoot(zone);
    const allFiles = await this.collectFiles(zoneRoot);
    const flags = options.caseSensitive === false ? "gi" : "g";
    const regex = new RegExp(pattern, flags);
    const fileRegex = options.filePattern
      ? globToRegex(options.filePattern)
      : null;
    const max = options.maxResults ?? Infinity;
    const results: SearchResult[] = [];

    for (const absPath of allFiles) {
      const relPath = relative(zoneRoot, absPath);
      if (fileRegex && !fileRegex.test(relPath)) continue;
      const content = await deno.readTextFile(absPath);
      const lines = content.split("\n");
      for (let i = 0; i < lines.length && results.length < max; i++) {
        regex.lastIndex = 0;
        const match = regex.exec(lines[i]!);
        if (match) {
          results.push({
            filePath: relPath,
            lineNumber: i + 1,
            lineContent: lines[i]!,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          });
        }
      }
      if (results.length >= max) break;
    }
    return results;
  }

  // -- Private helpers --------------------------------------------------------

  private zoneRoot(zone: FilesystemZone): string {
    return join(this.basePath, zone);
  }

  private resolvePath(path: string, zone: FilesystemZone): string {
    const zoneRoot = this.zoneRoot(zone);
    const resolved = resolve(zoneRoot, path);
    const rel = relative(zoneRoot, resolved);
    if (rel.startsWith("..")) {
      throw new Error(`Path traversal denied: ${path}`);
    }
    return resolved;
  }

  private async readEntries(
    dir: string,
    rootDir: string,
    options: ListOptions,
    depth: number,
  ): Promise<FileEntry[]> {
    const deno = getDeno();
    const maxDepth = options.maxDepth ?? (options.recursive ? Infinity : 1);
    if (depth > maxDepth) return [];

    const results: FileEntry[] = [];
    try {
      for await (const entry of deno.readDir(dir)) {
        if (!options.includeHidden && entry.name.startsWith(".")) continue;
        const fullPath = join(dir, entry.name);
        const relPath = relative(rootDir, fullPath);
        const s = await deno.stat(fullPath);
        results.push({
          name: entry.name,
          path: relPath,
          isDirectory: entry.isDirectory,
          size: s.size,
          modifiedAt: s.mtime ? s.mtime.getTime() : 0,
        });
        if (entry.isDirectory && options.recursive) {
          const children = await this.readEntries(
            fullPath,
            rootDir,
            options,
            depth + 1,
          );
          results.push(...children);
        }
      }
    } catch {
      // Directory does not exist or is unreadable
    }
    return results;
  }

  private async collectFiles(dir: string): Promise<string[]> {
    const deno = getDeno();
    const files: string[] = [];
    try {
      for await (const entry of deno.readDir(dir)) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory) {
          files.push(...(await this.collectFiles(fullPath)));
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory does not exist or is unreadable
    }
    return files;
  }
}
