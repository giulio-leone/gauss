// =============================================================================
// OpfsFilesystem — FilesystemPort via Origin Private File System API
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

// Minimal OPFS type declarations for cross-compilation
interface OPFSFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface OPFSDirectoryHandle {
  kind: "directory";
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OPFSFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OPFSDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  values(): AsyncIterable<OPFSFileHandle | OPFSDirectoryHandle>;
}

interface OpfsFilesystemOptions {
  rootName?: string;
}

async function getOpfsRoot(): Promise<OPFSDirectoryHandle> {
  const nav = globalThis.navigator as
    | { storage?: { getDirectory?: () => Promise<OPFSDirectoryHandle> } }
    | undefined;
  if (!nav?.storage?.getDirectory) {
    throw new Error("OPFS is not available in this environment");
  }
  return nav.storage.getDirectory();
}

export class OpfsFilesystem implements FilesystemPort {
  private readonly rootName: string;

  constructor(options: OpfsFilesystemOptions = {}) {
    this.rootName = options.rootName ?? "deep-agent";
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getZoneDir(zone: FilesystemZone): Promise<OPFSDirectoryHandle> {
    const root = await getOpfsRoot();
    const appDir = await root.getDirectoryHandle(this.rootName, { create: true });
    return appDir.getDirectoryHandle(zone, { create: true });
  }

  private async traverseToParent(
    dir: OPFSDirectoryHandle,
    segments: string[],
    create: boolean,
  ): Promise<{ parent: OPFSDirectoryHandle; name: string }> {
    let current = dir;
    for (let i = 0; i < segments.length - 1; i++) {
      current = await current.getDirectoryHandle(segments[i]!, { create });
    }
    return { parent: current, name: segments[segments.length - 1]! };
  }

  private parsePath(path: string): string[] {
    const segments = path
      .split("/")
      .filter((s) => s !== "" && s !== ".");
    if (segments.length === 0) {
      throw new Error("Path cannot be empty");
    }
    return segments;
  }

  private async collectFiles(
    dir: OPFSDirectoryHandle,
    prefix: string,
  ): Promise<Array<{ path: string; handle: OPFSFileHandle }>> {
    const results: Array<{ path: string; handle: OPFSFileHandle }> = [];
    for await (const entry of dir.values()) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        results.push({ path: entryPath, handle: entry as OPFSFileHandle });
      } else {
        const children = await this.collectFiles(
          entry as OPFSDirectoryHandle,
          entryPath,
        );
        results.push(...children);
      }
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // FilesystemPort implementation
  // ---------------------------------------------------------------------------

  async read(path: string, zone: FilesystemZone = "transient"): Promise<string> {
    const zoneDir = await this.getZoneDir(zone);
    const segments = this.parsePath(path);
    const { parent, name } = await this.traverseToParent(zoneDir, segments, false);
    const fileHandle = await parent.getFileHandle(name);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async write(
    path: string,
    content: string,
    zone: FilesystemZone = "transient",
  ): Promise<void> {
    const zoneDir = await this.getZoneDir(zone);
    const segments = this.parsePath(path);
    const { parent, name } = await this.traverseToParent(zoneDir, segments, true);
    const fileHandle = await parent.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async exists(path: string, zone: FilesystemZone = "transient"): Promise<boolean> {
    try {
      const zoneDir = await this.getZoneDir(zone);
      const segments = this.parsePath(path);
      const { parent, name } = await this.traverseToParent(zoneDir, segments, false);
      try {
        await parent.getFileHandle(name);
        return true;
      } catch {
        await parent.getDirectoryHandle(name);
        return true;
      }
    } catch {
      return false;
    }
  }

  async delete(path: string, zone: FilesystemZone = "transient"): Promise<void> {
    try {
      const zoneDir = await this.getZoneDir(zone);
      const segments = this.parsePath(path);
      const { parent, name } = await this.traverseToParent(zoneDir, segments, false);
      await parent.removeEntry(name, { recursive: true });
    } catch {
      // Ignore if not found
    }
  }

  async list(
    path: string,
    options: ListOptions = {},
    zone: FilesystemZone = "transient",
  ): Promise<FileEntry[]> {
    const zoneDir = await this.getZoneDir(zone);
    const segments = this.parsePath(path);
    let targetDir = zoneDir;
    for (const seg of segments) {
      targetDir = await targetDir.getDirectoryHandle(seg);
    }

    const maxDepth = options.maxDepth ?? (options.recursive ? Infinity : 1);
    return this.listEntries(targetDir, "", maxDepth, 1, options.includeHidden ?? false);
  }

  private async listEntries(
    dir: OPFSDirectoryHandle,
    prefix: string,
    maxDepth: number,
    currentDepth: number,
    includeHidden: boolean,
  ): Promise<FileEntry[]> {
    if (currentDepth > maxDepth) return [];
    const results: FileEntry[] = [];
    for await (const entry of dir.values()) {
      if (!includeHidden && entry.name.startsWith(".")) continue;
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        const file = await (entry as OPFSFileHandle).getFile();
        results.push({
          name: entry.name,
          path: entryPath,
          isDirectory: false,
          size: file.size,
          modifiedAt: file.lastModified,
        });
      } else {
        results.push({
          name: entry.name,
          path: entryPath,
          isDirectory: true,
          size: 0,
          modifiedAt: Date.now(),
        });
        const children = await this.listEntries(
          entry as OPFSDirectoryHandle,
          entryPath,
          maxDepth,
          currentDepth + 1,
          includeHidden,
        );
        results.push(...children);
      }
    }
    return results;
  }

  async stat(path: string, zone: FilesystemZone = "transient"): Promise<FileStat> {
    const zoneDir = await this.getZoneDir(zone);
    const segments = this.parsePath(path);
    const { parent, name } = await this.traverseToParent(zoneDir, segments, false);

    try {
      const fileHandle = await parent.getFileHandle(name);
      const file = await fileHandle.getFile();
      return {
        size: file.size,
        isDirectory: false,
        isFile: true,
        createdAt: file.lastModified,
        modifiedAt: file.lastModified,
      };
    } catch {
      // Try as directory
      await parent.getDirectoryHandle(name);
      return {
        size: 0,
        isDirectory: true,
        isFile: false,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
    }
  }

  async glob(pattern: string, zone: FilesystemZone = "transient"): Promise<string[]> {
    const zoneDir = await this.getZoneDir(zone);
    const allFiles = await this.collectFiles(zoneDir, "");
    const regex = globToRegex(pattern);
    return allFiles.map((f) => f.path).filter((p) => regex.test(p));
  }

  async search(
    pattern: string,
    options: SearchOptions = {},
    zone: FilesystemZone = "transient",
  ): Promise<SearchResult[]> {
    const zoneDir = await this.getZoneDir(zone);
    const allFiles = await this.collectFiles(zoneDir, "");
    const flags = options.caseSensitive === false ? "gi" : "g";
    const regex = new RegExp(pattern, flags);
    const fileRegex = options.filePattern ? globToRegex(options.filePattern) : null;
    const max = options.maxResults ?? Infinity;
    const results: SearchResult[] = [];

    for (const { path: filePath, handle } of allFiles) {
      if (fileRegex && !fileRegex.test(filePath)) continue;
      const file = await handle.getFile();
      const content = await file.text();
      const lines = content.split("\n");
      for (let i = 0; i < lines.length && results.length < max; i++) {
        regex.lastIndex = 0;
        const match = regex.exec(lines[i]!);
        if (match) {
          results.push({
            filePath,
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

  async syncToPersistent(): Promise<void> {
    // OPFS is already persistent — no-op
  }

  async clearTransient(): Promise<void> {
    const root = await getOpfsRoot();
    const appDir = await root.getDirectoryHandle(this.rootName, { create: true });
    try {
      await appDir.removeEntry("transient", { recursive: true });
    } catch {
      // Ignore if not found
    }
    await appDir.getDirectoryHandle("transient", { create: true });
  }
}
