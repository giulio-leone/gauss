// =============================================================================
// Gauss Agent Core — Factory Function
// Agent() is the foundational primitive of gauss-flow.
// Every .with() returns a NEW immutable instance.
// =============================================================================

import type {
  AgentConfig,
  AgentInstance,
  AgentResult,
  AgentStream,
  Decorator,
  RunOptions,
} from "./types.js";
import { runAgent } from "./run.js";
import { streamAgent } from "./stream.js";
import { agentsToTools } from "./subagent.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// Agent factory
// ---------------------------------------------------------------------------

/**
 * Create a new Agent instance.
 *
 * @example
 * ```ts
 * const agent = Agent({ model, instructions: "You help with weather.", tools: { weather } });
 * const { text } = await agent.run("What's the weather in Rome?");
 * ```
 */
export function Agent(config: AgentConfig): AgentInstance {
  if (!config.model) {
    throw new Error("Agent requires a model");
  }

  const resolvedConfig: AgentConfig = {
    ...config,
    maxSteps: config.maxSteps ?? DEFAULT_MAX_STEPS,
    tools: mergeToolsWithAgents(config.tools, config.agents),
  };

  return createInstance(resolvedConfig, []);
}

// ---------------------------------------------------------------------------
// Internal instance builder
// ---------------------------------------------------------------------------

function createInstance(
  config: AgentConfig,
  decorators: ReadonlyArray<Decorator>,
): AgentInstance {
  const frozenConfig = Object.freeze({ ...config });
  const frozenDecorators = Object.freeze([...decorators]);

  let initialized = false;

  async function ensureInitialized(): Promise<void> {
    if (initialized) return;
    initialized = true;
    for (const d of frozenDecorators) {
      if (d.initialize) await d.initialize();
    }
  }

  const instance: AgentInstance = {
    async run(prompt: string, options?: RunOptions): Promise<AgentResult> {
      await ensureInitialized();
      return runAgent(frozenConfig, frozenDecorators, prompt, options);
    },

    stream(prompt: string, options?: RunOptions): AgentStream {
      const initPromise = ensureInitialized();
      return streamAgent(frozenConfig, frozenDecorators, prompt, options, initPromise);
    },

    with(decorator: Decorator): AgentInstance {
      return createInstance(frozenConfig, [...frozenDecorators, decorator]);
    },

    clone(overrides?: Partial<AgentConfig>): AgentInstance {
      const merged: AgentConfig = {
        ...frozenConfig,
        ...overrides,
        tools: mergeToolsWithAgents(
          overrides?.tools ?? frozenConfig.tools,
          overrides?.agents ?? frozenConfig.agents,
        ),
      };
      return createInstance(merged, [...frozenDecorators]);
    },

    get config() {
      return frozenConfig;
    },

    get decorators() {
      return frozenDecorators;
    },
  };

  return Object.freeze(instance);
}

// ---------------------------------------------------------------------------
// Merge explicit tools with agent-derived tools
// ---------------------------------------------------------------------------

function mergeToolsWithAgents(
  tools: AgentConfig["tools"],
  agents: AgentConfig["agents"],
): AgentConfig["tools"] {
  if (!agents || Object.keys(agents).length === 0) {
    return tools;
  }

  const agentTools = agentsToTools(agents);
  return { ...agentTools, ...tools }; // explicit tools take precedence
}
