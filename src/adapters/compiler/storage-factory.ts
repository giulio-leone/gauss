// =============================================================================
// Storage Factory — Env-based strategy selection for WorkflowStoragePort
// =============================================================================

import type { WorkflowStoragePort, StorageStrategy } from "../../ports/compiler.port.js";
import { FileWorkflowStorage, type FileStorageOptions } from "./file-workflow-storage.js";
import { InMemoryWorkflowStorage } from "./inmemory-workflow-storage.js";
import { DualWorkflowStorage } from "./dual-workflow-storage.js";

export interface StorageFactoryOptions {
  /** Override strategy (ignores env var) */
  strategy?: StorageStrategy;
  /** File storage options */
  fileOptions?: FileStorageOptions;
  /** External DB storage adapter (injected by consumer) */
  dbStorage?: WorkflowStoragePort;
  /** Env var name for strategy selection (default: WORKFLOW_STORAGE) */
  envVar?: string;
}

/**
 * Creates a WorkflowStoragePort based on environment configuration.
 * 
 * Resolution order: options.strategy → process.env[envVar] → "file" (default)
 * 
 * Strategies:
 * - "file": File-based JSON storage
 * - "db": Database storage (requires options.dbStorage)
 * - "dual": Primary DB + secondary file (requires options.dbStorage)
 * - "memory": In-memory (for testing)
 */
export function createWorkflowStorage(options: StorageFactoryOptions = {}): WorkflowStoragePort {
  const envVar = options.envVar ?? "WORKFLOW_STORAGE";
  const raw = options.strategy ?? process.env[envVar] ?? "file";
  const strategy = raw as StorageStrategy | "memory";

  switch (strategy) {
    case "file":
      return new FileWorkflowStorage(
        options.fileOptions ?? { basePath: ".workflows" },
      );

    case "memory":
      return new InMemoryWorkflowStorage();

    case "db":
      if (!options.dbStorage) {
        throw new Error(
          `Storage strategy "db" requires options.dbStorage. ` +
          `Provide a WorkflowStoragePort implementation (e.g. SupabaseWorkflowStorage).`,
        );
      }
      return options.dbStorage;

    case "dual": {
      if (!options.dbStorage) {
        throw new Error(
          `Storage strategy "dual" requires options.dbStorage. ` +
          `Provide a WorkflowStoragePort implementation for the primary store.`,
        );
      }
      const fileStorage = new FileWorkflowStorage(
        options.fileOptions ?? { basePath: ".workflows" },
      );
      return new DualWorkflowStorage(options.dbStorage, fileStorage);
    }

    default:
      throw new Error(
        `Unknown storage strategy "${strategy}". Valid values: file, db, dual, memory`,
      );
  }
}
