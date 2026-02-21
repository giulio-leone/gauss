// =============================================================================
// InMemoryWorkflowStorage — For testing and dev environments
// =============================================================================

import type { WorkflowStoragePort, StoredWorkflow } from "../../ports/compiler.port.js";

export class InMemoryWorkflowStorage implements WorkflowStoragePort {
  private readonly store = new Map<string, StoredWorkflow>();

  async save(workflow: StoredWorkflow): Promise<void> {
    this.store.set(workflow.id, structuredClone(workflow));
  }

  async load(id: string): Promise<StoredWorkflow | null> {
    const w = this.store.get(id);
    return w ? structuredClone(w) : null;
  }

  async list(): Promise<StoredWorkflow[]> {
    return [...this.store.values()].map((w) => structuredClone(w));
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.store.has(id);
  }

  clear(): void {
    this.store.clear();
  }
}
