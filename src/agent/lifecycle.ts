// =============================================================================
// Agent Lifecycle Manager — Startup, Shutdown, and Health Management
// =============================================================================

/** Graceful shutdown timeout in ms (30 seconds) */
const SHUTDOWN_TIMEOUT_MS = 30_000;

export interface LifecycleHooks {
  onStartup?: () => Promise<void>;
  onShutdown?: () => Promise<void>;
  onHealthCheck?: () => Promise<HealthStatus>;
}

export interface HealthStatus {
  healthy: boolean;
  details?: Record<string, { status: 'up' | 'down'; message?: string }>;
}

export class LifecycleManager {
  private _isReady = false;
  private _isShuttingDown = false;
  private readonly hooks: LifecycleHooks;
  private readonly runningOperations = new Set<Promise<unknown>>();

  constructor(hooks: LifecycleHooks) {
    this.hooks = hooks;
  }

  async startup(): Promise<void> {
    if (this._isReady) return;
    
    try {
      if (this.hooks.onStartup) {
        await this.hooks.onStartup();
      }
      this._isReady = true;
    } catch (error) {
      this._isReady = false;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this._isShuttingDown) return;
    
    this._isShuttingDown = true;
    this._isReady = false;

    // Wait for running operations to complete (timeout 30s)
    if (this.runningOperations.size > 0) {
      const controller = new AbortController();
      const timeout = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, SHUTDOWN_TIMEOUT_MS);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      
      const allOperations = Promise.all(Array.from(this.runningOperations))
        .then(() => {})
        // fire-and-forget: running operations must not prevent graceful shutdown
        .catch((err: unknown) => {
          console.warn("[shutdown] Error in running operation:", err instanceof Error ? err.message : String(err));
        });
      
      await Promise.race([allOperations, timeout]);
      controller.abort();
    }

    try {
      if (this.hooks.onShutdown) {
        await this.hooks.onShutdown();
      }
    } finally {
      // Clear any remaining operations
      this.runningOperations.clear();
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.hooks.onHealthCheck) {
      return this.hooks.onHealthCheck();
    }
    
    return {
      healthy: this._isReady && !this._isShuttingDown,
      details: {
        lifecycle: {
          status: this._isReady && !this._isShuttingDown ? 'up' : 'down',
          message: this._isShuttingDown 
            ? 'Agent is shutting down' 
            : this._isReady 
              ? 'Agent is ready' 
              : 'Agent not started',
        },
      },
    };
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * Track a running operation for graceful shutdown.
   * Returns a cleanup function to remove the operation from tracking.
   */
  trackOperation<T>(operation: Promise<T>): Promise<T> {
    this.runningOperations.add(operation);
    
    const cleanup = () => {
      this.runningOperations.delete(operation);
    };
    
    operation.finally(cleanup);
    return operation;
  }
}