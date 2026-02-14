// =============================================================================
// Plugin Port — Contract for DeepAgent plugins
// =============================================================================

import type { Tool } from "ai";

import type { AgentEventHandler, AgentEventType } from "../types.js";
import type { FilesystemPort } from "./filesystem.port.js";
import type { MemoryPort } from "./memory.port.js";

export interface PluginRunMetadata {
  readonly [key: string]: unknown;
}

/** Context passed to plugin hooks — read-only snapshot of the current run */
export interface PluginContext {
  readonly sessionId: string;
  readonly agentName?: string;
  readonly config: Readonly<{ instructions: string; maxSteps: number }>;
  readonly filesystem: FilesystemPort;
  readonly memory: MemoryPort;
  readonly toolNames: readonly string[];
  readonly runMetadata?: PluginRunMetadata;
}

/** Context passed once during plugin setup */
export interface PluginSetupContext extends Omit<PluginContext, "runMetadata"> {
  /** Subscribe to agent lifecycle events; returned function unsubscribes */
  on(eventType: AgentEventType | "*", handler: AgentEventHandler): () => void;
}

export interface BeforeRunParams {
  prompt: string;
}

export interface BeforeRunResult {
  prompt?: string;
}

export interface AfterRunParams {
  result: {
    text: string;
    steps: unknown[];
    sessionId: string;
  };
}

export interface BeforeToolParams {
  toolName: string;
  args: unknown;
}

export interface BeforeToolResult {
  args?: unknown;
  skip?: boolean;
  result?: unknown;
}

export interface AfterToolParams {
  toolName: string;
  args: unknown;
  result: unknown;
}

export interface BeforeStepParams {
  stepIndex: number;
  step: unknown;
}

export interface BeforeStepResult {
  step?: unknown;
  skip?: boolean;
}

export interface AfterStepParams {
  stepIndex: number;
  step: unknown;
}

export interface OnErrorParams {
  error: unknown;
  phase: "run" | "stream" | "tool" | "step" | "setup";
}

export interface OnErrorResult {
  suppress?: boolean;
}

export interface PluginHooks {
  beforeRun?(ctx: PluginContext, params: BeforeRunParams): Promise<BeforeRunResult | void> | BeforeRunResult | void;
  afterRun?(ctx: PluginContext, params: AfterRunParams): Promise<void> | void;
  beforeTool?(ctx: PluginContext, params: BeforeToolParams): Promise<BeforeToolResult | void> | BeforeToolResult | void;
  afterTool?(ctx: PluginContext, params: AfterToolParams): Promise<void> | void;
  beforeStep?(ctx: PluginContext, params: BeforeStepParams): Promise<BeforeStepResult | void> | BeforeStepResult | void;
  afterStep?(ctx: PluginContext, params: AfterStepParams): Promise<void> | void;
  onError?(ctx: PluginContext, params: OnErrorParams): Promise<OnErrorResult | void> | OnErrorResult | void;
}

export interface DeepAgentPlugin {
  readonly name: string;
  readonly version?: string;
  readonly hooks?: PluginHooks;
  readonly tools?: Record<string, Tool>;
  setup?(ctx: PluginSetupContext): Promise<void> | void;
  dispose?(): Promise<void> | void;
}
