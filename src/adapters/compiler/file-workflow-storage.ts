// =============================================================================
// FileWorkflowStorage — Persists workflows as YAML/JSON files on disk
// =============================================================================

import type { WorkflowStoragePort, StoredWorkflow } from "../../ports/compiler.port.js";

export interface FileStorageOptions {
  basePath: string;
  format?: "json" | "yaml";
}

export class FileWorkflowStorage implements WorkflowStoragePort {
  private readonly basePath: string;
  private readonly format: "json" | "yaml";
  private fs: typeof import("node:fs/promises") | undefined;
  private path: typeof import("node:path") | undefined;

  constructor(options: FileStorageOptions) {
    this.basePath = options.basePath;
    this.format = options.format ?? "json";
  }

  private async ensureModules(): Promise<void> {
    if (!this.fs) {
      this.fs = await import("node:fs/promises");
      this.path = await import("node:path");
      await this.fs.mkdir(this.basePath, { recursive: true });
    }
  }

  private filePath(id: string): string {
    const candidate = this.path!.join(this.basePath, `${id}.${this.format}`);
    const resolved = this.path!.resolve(candidate);
    const base = this.path!.resolve(this.basePath);
    if (!resolved.startsWith(base + this.path!.sep) && resolved !== base) {
      throw new Error("Invalid workflow ID: path traversal detected");
    }
    return candidate;
  }

  async save(workflow: StoredWorkflow): Promise<void> {
    await this.ensureModules();
    const content = JSON.stringify(workflow, null, 2);
    await this.fs!.writeFile(this.filePath(workflow.id), content, "utf-8");
  }

  async load(id: string): Promise<StoredWorkflow | null> {
    await this.ensureModules();
    try {
      const content = await this.fs!.readFile(this.filePath(id), "utf-8");
      return JSON.parse(content) as StoredWorkflow;
    } catch {
      return null;
    }
  }

  async list(): Promise<StoredWorkflow[]> {
    await this.ensureModules();
    try {
      const files = await this.fs!.readdir(this.basePath);
      const ext = `.${this.format}`;
      const workflows: StoredWorkflow[] = [];
      for (const file of files) {
        if (file.endsWith(ext)) {
          try {
            const content = await this.fs!.readFile(
              this.path!.join(this.basePath, file),
              "utf-8",
            );
            workflows.push(JSON.parse(content) as StoredWorkflow);
          } catch {
            // Skip corrupted files, don't break entire listing
          }
        }
      }
      return workflows;
    } catch {
      return [];
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureModules();
    try {
      await this.fs!.unlink(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }

  async exists(id: string): Promise<boolean> {
    await this.ensureModules();
    try {
      await this.fs!.access(this.filePath(id));
      return true;
    } catch {
      return false;
    }
  }
}
