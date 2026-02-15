import { VirtualFilesystem } from "../adapters/filesystem/virtual-fs.adapter.js";
import { InMemoryAdapter } from "../adapters/memory/in-memory.adapter.js";
import { ApproximateTokenCounter } from "../adapters/token-counter/approximate.adapter.js";

export function defaultFilesystem() { return new VirtualFilesystem(); }
export function defaultMemory() { return new InMemoryAdapter(); }
export function defaultTokenCounter() { return new ApproximateTokenCounter(); }
