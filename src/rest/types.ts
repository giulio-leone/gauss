// =============================================================================
// REST API — Type Definitions
// =============================================================================

export interface ServerOptions {
  /** Port to listen on. Default: 3456 */
  port?: number;
  /** Required API key for Bearer token auth. If unset, auth is disabled. */
  apiKey?: string;
  /** Default AI provider. Default: "openai" */
  defaultProvider?: string;
  /** Default model ID. Default: "gpt-4o" */
  defaultModel?: string;
  /** Enable CORS headers. Default: true */
  cors?: boolean;
}

export interface RunRequest {
  prompt: string;
  model?: string;
  provider?: string;
  apiKey?: string;
  instructions?: string;
  plugins?: string[];
  maxSteps?: number;
}

export interface RunResponse {
  text: string;
  sessionId: string;
  steps: number;
  duration: number;
}

export interface StreamEvent {
  type: "token" | "done" | "error";
  content?: string;
  text?: string;
  sessionId?: string;
  error?: string;
}

export interface GraphRunRequest {
  prompt: string;
  nodes: GraphNodeDef[];
  edges?: GraphEdgeDef[];
  provider?: string;
  model?: string;
  apiKey?: string;
}

export interface GraphNodeDef {
  id: string;
  instructions: string;
  model?: string;
  provider?: string;
}

export interface GraphEdgeDef {
  from: string;
  to: string;
}

export interface ErrorResponse {
  error: {
    code: number;
    message: string;
  };
}

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface InfoResponse {
  version: string;
  defaultProvider: string;
  defaultModel: string;
  endpoints: string[];
}
