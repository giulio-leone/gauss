// =============================================================================
// storage-factory.test.ts — Tests for env-based storage strategy selection
// =============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { createWorkflowStorage } from "../../adapters/compiler/storage-factory.js";
import { FileWorkflowStorage } from "../../adapters/compiler/file-workflow-storage.js";
import { InMemoryWorkflowStorage } from "../../adapters/compiler/inmemory-workflow-storage.js";
import { DualWorkflowStorage } from "../../adapters/compiler/dual-workflow-storage.js";
import type { WorkflowStoragePort } from "../../ports/compiler.port.js";

const mockDbStorage: WorkflowStoragePort = {
  save: vi.fn(),
  load: vi.fn(),
  list: vi.fn().mockResolvedValue([]),
  delete: vi.fn(),
  exists: vi.fn(),
};

describe("createWorkflowStorage", () => {
  afterEach(() => {
    delete process.env.WORKFLOW_STORAGE;
  });

  it("should default to file storage", () => {
    const storage = createWorkflowStorage();
    expect(storage).toBeInstanceOf(FileWorkflowStorage);
  });

  it("should create file storage from explicit strategy", () => {
    const storage = createWorkflowStorage({ strategy: "file" });
    expect(storage).toBeInstanceOf(FileWorkflowStorage);
  });

  it("should create memory storage", () => {
    const storage = createWorkflowStorage({ strategy: "memory" as any });
    expect(storage).toBeInstanceOf(InMemoryWorkflowStorage);
  });

  it("should create db storage with provided adapter", () => {
    const storage = createWorkflowStorage({
      strategy: "db",
      dbStorage: mockDbStorage,
    });
    expect(storage).toBe(mockDbStorage);
  });

  it("should throw for db strategy without adapter", () => {
    expect(() => createWorkflowStorage({ strategy: "db" })).toThrow(
      "requires options.dbStorage",
    );
  });

  it("should create dual storage with db + file", () => {
    const storage = createWorkflowStorage({
      strategy: "dual",
      dbStorage: mockDbStorage,
    });
    expect(storage).toBeInstanceOf(DualWorkflowStorage);
  });

  it("should throw for dual strategy without adapter", () => {
    expect(() => createWorkflowStorage({ strategy: "dual" })).toThrow(
      "requires options.dbStorage",
    );
  });

  it("should read strategy from env var", () => {
    process.env.WORKFLOW_STORAGE = "memory";
    const storage = createWorkflowStorage();
    expect(storage).toBeInstanceOf(InMemoryWorkflowStorage);
  });

  it("should prefer explicit strategy over env var", () => {
    process.env.WORKFLOW_STORAGE = "db";
    const storage = createWorkflowStorage({ strategy: "file" });
    expect(storage).toBeInstanceOf(FileWorkflowStorage);
  });

  it("should support custom env var name", () => {
    process.env.MY_STORAGE = "memory";
    const storage = createWorkflowStorage({ envVar: "MY_STORAGE" });
    expect(storage).toBeInstanceOf(InMemoryWorkflowStorage);
    delete process.env.MY_STORAGE;
  });

  it("should throw for unknown strategy", () => {
    expect(() => createWorkflowStorage({ strategy: "redis" as any })).toThrow(
      "Unknown storage strategy",
    );
  });
});
