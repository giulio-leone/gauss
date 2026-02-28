// =============================================================================
// QueuePort — Job queue abstraction for background task processing
// =============================================================================

export interface QueueJob<T = Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  opts?: QueueJobOptions;
}

export interface QueueJobOptions {
  /** Delay before processing (ms) */
  delay?: number;
  /** Max retry attempts */
  attempts?: number;
  /** Backoff strategy */
  backoff?: { type: "fixed" | "exponential"; delay: number };
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Remove job after completion */
  removeOnComplete?: boolean | number;
  /** Remove job after failure */
  removeOnFail?: boolean | number;
}

export interface QueueJobResult<T = Record<string, unknown>> {
  id: string;
  name: string;
  data: T;
  status: "waiting" | "active" | "completed" | "failed" | "delayed";
  progress: number;
  returnvalue?: unknown;
  failedReason?: string;
  attemptsMade: number;
  timestamp: number;
  finishedOn?: number;
}

export type QueueProcessor<T = Record<string, unknown>> = (
  job: QueueJob<T>,
) => Promise<unknown>;

// =============================================================================
// Port interface
// =============================================================================

export interface QueuePort {
  /** Add a job to the queue */
  add<T = Record<string, unknown>>(
    name: string,
    data: T,
    opts?: QueueJobOptions,
  ): Promise<QueueJob<T>>;

  /** Register a processor for jobs */
  process<T = Record<string, unknown>>(
    handler: QueueProcessor<T>,
    concurrency?: number,
  ): Promise<void>;

  /** Get a job by ID */
  getJob(id: string): Promise<QueueJobResult | null>;

  /** Pause the queue */
  pause(): Promise<void>;

  /** Resume the queue */
  resume(): Promise<void>;

  /** Close connections and clean up */
  close(): Promise<void>;
}
