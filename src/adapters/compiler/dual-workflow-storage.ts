// =============================================================================
// DualWorkflowStorage — Orchestrates DB + File storage (DB is source of truth)
// =============================================================================

import type { WorkflowStoragePort, StoredWorkflow } from "../../ports/compiler.port.js";

export class DualWorkflowStorage implements WorkflowStoragePort {
  constructor(
    private readonly primary: WorkflowStoragePort,
    private readonly secondary: WorkflowStoragePort,
  ) {}

  async save(workflow: StoredWorkflow): Promise<void> {
    await this.primary.save(workflow);
    await this.secondary.save(workflow).catch(() => {
      // Secondary write failure is non-fatal
    });
  }

  async load(id: string): Promise<StoredWorkflow | null> {
    return this.primary.load(id);
  }

  async list(): Promise<StoredWorkflow[]> {
    return this.primary.list();
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.primary.delete(id);
    await this.secondary.delete(id).catch(() => { /* best-effort secondary cleanup */ });
    return result;
  }

  async exists(id: string): Promise<boolean> {
    return this.primary.exists(id);
  }
}
