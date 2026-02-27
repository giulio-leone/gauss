// =============================================================================
// DeployerPort — Multi-cloud deployment contract
// =============================================================================

export type DeploymentStatus = "pending" | "building" | "deploying" | "ready" | "failed" | "rolled_back";

export interface DeploymentConfig {
  name: string;
  entrypoint: string;
  runtime?: string;
  env?: Record<string, string>;
  region?: string;
  memory?: number;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export interface DeploymentInfo {
  id: string;
  name: string;
  status: DeploymentStatus;
  url?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface DeployerPort {
  /** Build the deployment artifact */
  build(config: DeploymentConfig): Promise<{ artifactPath: string; size: number }>;

  /** Deploy the artifact */
  deploy(config: DeploymentConfig): Promise<DeploymentInfo>;

  /** Get deployment status */
  status(deploymentId: string): Promise<DeploymentInfo | undefined>;

  /** Rollback to a previous version */
  rollback(deploymentId: string, targetVersion?: number): Promise<DeploymentInfo>;

  /** List all deployments */
  list(name?: string): Promise<DeploymentInfo[]>;

  /** Remove a deployment */
  remove(deploymentId: string): Promise<void>;
}
