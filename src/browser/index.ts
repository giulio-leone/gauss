// @giulio-leone/gaussflow-agent/browser — Browser-specific adapters
// Re-exports edge adapters (OPFS + IndexedDB work in browsers too)
export { OpfsFilesystem } from "../edge/opfs-fs.adapter.js";
export { IndexedDbMemoryAdapter } from "../edge/indexeddb-memory.adapter.js";
