// =============================================================================
// InMemoryDeployerAdapter — Mock deployer for testing & local dev
// =============================================================================

import type { DeployerPort, DeploymentConfig, DeploymentInfo } from "../../ports/deployer.port.js";
import { randomUUID } from "node:crypto";

let deployCounter = 0;

export class InMemoryDeployerAdapter implements DeployerPort {
  private deployments = new Map<string, DeploymentInfo>();

  async build(config: DeploymentConfig): Promise<{ artifactPath: string; size: number }> {
    return { artifactPath: `/tmp/builds/${config.name}.tar.gz`, size: 1024 };
  }

  async deploy(config: DeploymentConfig): Promise<DeploymentInfo> {
    const id = randomUUID();
    const existing = [...this.deployments.values()].filter(d => d.name === config.name);
    const version = existing.length + 1;
    const now = Date.now();
    const info: DeploymentInfo = {
      id,
      name: config.name,
      status: "ready",
      url: `https://${config.name}.local.dev`,
      version,
      createdAt: now,
      updatedAt: now,
      metadata: config.metadata,
    };
    this.deployments.set(id, info);
    return { ...info };
  }

  async status(deploymentId: string): Promise<DeploymentInfo | undefined> {
    const d = this.deployments.get(deploymentId);
    return d ? { ...d } : undefined;
  }

  async rollback(deploymentId: string, targetVersion?: number): Promise<DeploymentInfo> {
    const d = this.deployments.get(deploymentId);
    if (!d) throw new Error(`Deployment "${deploymentId}" not found`);

    // Mark current as rolled back
    d.status = "rolled_back";
    d.updatedAt = Date.now();

    // If target version specified, create a new deployment from it
    if (targetVersion !== undefined) {
      const target = [...this.deployments.values()].find(
        dep => dep.name === d.name && dep.version === targetVersion,
      );
      if (!target) throw new Error(`Version ${targetVersion} not found for "${d.name}"`);

      const id = randomUUID();
      const restored: DeploymentInfo = {
        id,
        name: d.name,
        status: "ready",
        url: target.url,
        version: Math.max(...[...this.deployments.values()].filter(x => x.name === d.name).map(x => x.version)) + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: target.metadata,
      };
      this.deployments.set(id, restored);
      return { ...restored };
    }

    return { ...d };
  }

  async list(name?: string): Promise<DeploymentInfo[]> {
    const all = [...this.deployments.values()];
    return name ? all.filter(d => d.name === name) : all;
  }

  async remove(deploymentId: string): Promise<void> {
    if (!this.deployments.delete(deploymentId)) throw new Error(`Deployment "${deploymentId}" not found`);
  }
}
