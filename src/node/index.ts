// @onegenui/deep-agents/node — Node.js-specific adapters
export { LocalFilesystem } from "../adapters/filesystem/local-fs.adapter.js";
export { TiktokenTokenCounter } from "../adapters/token-counter/tiktoken.adapter.js";
export type { DiskSyncFn } from "../adapters/filesystem/virtual-fs.adapter.js";

// Re-export a helper to create a VirtualFilesystem with Node.js disk sync
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";
import type { DiskSyncFn } from "../adapters/filesystem/virtual-fs.adapter.js";

/** Create a DiskSyncFn using Node.js fs for use with VirtualFilesystem */
export function createNodeDiskSync(): DiskSyncFn {
  return async (filePath: string, content: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  };
}

/** Create a VirtualFilesystem with Node.js disk sync support */
export function createNodeVirtualFilesystem(basePath?: string): VirtualFilesystem {
  return new VirtualFilesystem({
    basePath: basePath ?? process.cwd(),
    onSync: createNodeDiskSync(),
  });
}
