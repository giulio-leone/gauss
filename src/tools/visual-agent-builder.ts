// =============================================================================
// Visual Agent Builder — Declarative JSON config → Agent instantiation
// =============================================================================

import { z } from "zod";
import type { LanguageModel } from "../core/llm/index.js";

// =============================================================================
// Config Schema — JSON declarative agent definition
// =============================================================================

export const ToolConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const AgentNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["agent", "tool", "router", "transform"]),
  model: z.string().optional(),
  instructions: z.string().optional(),
  tools: z.array(ToolConfigSchema).optional(),
  maxSteps: z.number().optional(),
  temperature: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
});

export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default("1.0.0"),
  nodes: z.array(AgentNodeSchema),
  edges: z.array(EdgeSchema).default([]),
  entryNode: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AgentConfigJSON = z.infer<typeof AgentConfigSchema>;
export type AgentNode = z.infer<typeof AgentNodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;

// =============================================================================
// ModelRegistry — Maps string model names to LanguageModel instances
// =============================================================================

export class ModelRegistry {
  private models = new Map<string, LanguageModel>();

  register(name: string, model: LanguageModel): this {
    this.models.set(name, model);
    return this;
  }

  get(name: string): LanguageModel {
    const model = this.models.get(name);
    if (!model) {
      throw new Error(
        `Model "${name}" not registered. Available: ${[...this.models.keys()].join(", ")}`
      );
    }
    return model;
  }

  has(name: string): boolean {
    return this.models.has(name);
  }

  list(): string[] {
    return [...this.models.keys()];
  }
}

// =============================================================================
// AgentBuilder — Compiles JSON config to executable agent graph
// =============================================================================

export interface CompiledAgent {
  id: string;
  name: string;
  config: AgentConfigJSON;
  nodes: Map<string, CompiledNode>;
  edges: Edge[];
  entryNode: string;
  execute: (input: string) => Promise<AgentBuilderResult>;
}

export interface CompiledNode {
  id: string;
  type: AgentNode["type"];
  model?: LanguageModel;
  instructions?: string;
  execute: (input: string, context: Record<string, unknown>) => Promise<string>;
}

export interface AgentBuilderResult {
  output: string;
  nodesExecuted: string[];
  durationMs: number;
}

export class VisualAgentBuilder {
  private registry: ModelRegistry;

  constructor(registry?: ModelRegistry) {
    this.registry = registry ?? new ModelRegistry();
  }

  /** Validate a JSON config */
  validate(config: unknown): { valid: boolean; errors: string[] } {
    const result = AgentConfigSchema.safeParse(config);
    if (result.success) {
      // Check entry node exists
      const entryExists = result.data.nodes.some(
        (n) => n.id === result.data.entryNode
      );
      if (!entryExists) {
        return {
          valid: false,
          errors: [`Entry node "${result.data.entryNode}" not found in nodes`],
        };
      }
      // Check edge references
      const nodeIds = new Set(result.data.nodes.map((n) => n.id));
      for (const edge of result.data.edges) {
        if (!nodeIds.has(edge.from)) {
          return {
            valid: false,
            errors: [`Edge references unknown node "${edge.from}"`],
          };
        }
        if (!nodeIds.has(edge.to)) {
          return {
            valid: false,
            errors: [`Edge references unknown node "${edge.to}"`],
          };
        }
      }
      return { valid: true, errors: [] };
    }
    return {
      valid: false,
      errors: (result.error.issues ?? (result.error as any).errors ?? []).map(
        (e) => `${e.path.join(".")}: ${e.message}`
      ),
    };
  }

  /** Compile JSON config into an executable agent */
  compile(config: AgentConfigJSON): CompiledAgent {
    const validation = this.validate(config);
    if (!validation.valid) {
      throw new Error(`Invalid config: ${validation.errors.join("; ")}`);
    }

    const nodes = new Map<string, CompiledNode>();

    for (const node of config.nodes) {
      nodes.set(node.id, this.compileNode(node));
    }

    const execute = async (input: string): Promise<AgentBuilderResult> => {
      const start = Date.now();
      const nodesExecuted: string[] = [];
      const context: Record<string, unknown> = {};
      let currentOutput = input;
      let currentNodeId: string | undefined = config.entryNode;

      while (currentNodeId) {
        const node = nodes.get(currentNodeId);
        if (!node) break;

        currentOutput = await node.execute(currentOutput, context);
        nodesExecuted.push(currentNodeId);
        context[currentNodeId] = currentOutput;

        // Find next node via edges
        const outEdges = config.edges.filter((e) => e.from === currentNodeId);
        currentNodeId = undefined;

        for (const edge of outEdges) {
          if (!edge.condition) {
            currentNodeId = edge.to;
            break;
          }
          // Simple condition evaluation: check if context value is truthy
          try {
            const condFn = new Function(
              "ctx",
              "output",
              `return ${edge.condition}`
            );
            if (condFn(context, currentOutput)) {
              currentNodeId = edge.to;
              break;
            }
          } catch {
            // skip edge on condition error
          }
        }
      }

      return {
        output: currentOutput,
        nodesExecuted,
        durationMs: Date.now() - start,
      };
    };

    return {
      id: config.id,
      name: config.name,
      config,
      nodes,
      edges: config.edges,
      entryNode: config.entryNode,
      execute,
    };
  }

  private compileNode(node: AgentNode): CompiledNode {
    const model = node.model ? this.registry.get(node.model) : undefined;

    switch (node.type) {
      case "transform":
        return {
          id: node.id,
          type: node.type,
          execute: async (input) => {
            // Transform passes through with optional instructions as prefix
            return node.instructions
              ? `${node.instructions}\n${input}`
              : input;
          },
        };

      case "router":
        return {
          id: node.id,
          type: node.type,
          execute: async (input) => input, // routing handled by edges
        };

      case "tool":
        return {
          id: node.id,
          type: node.type,
          execute: async (input) => {
            // Tool nodes are placeholders — real tools injected at runtime
            return `[tool:${node.id}] ${input}`;
          },
        };

      case "agent":
      default:
        return {
          id: node.id,
          type: node.type,
          model,
          instructions: node.instructions,
          execute: async (input) => {
            if (!model) {
              return `[agent:${node.id}] ${input}`;
            }
            // Dynamic import to avoid hard dependency
            const { generateText } = await import("../core/llm/index.js");
            const result = await generateText({
              model: model as any,
              prompt: input,
              system: node.instructions,
            });
            return result.text;
          },
        };
    }
  }

  /** Get the model registry */
  getRegistry(): ModelRegistry {
    return this.registry;
  }
}
