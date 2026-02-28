// =============================================================================
// Gauss Agent Core — Subagent-as-Tool Conversion
// Converts agents config into automatic tools.
// =============================================================================

import { z } from "zod";
import { tool } from "../llm/tool.js";
import type { ToolSet } from "../llm/types.js";
import type { AgentInstance } from "./types.js";

/**
 * Convert a record of AgentInstances into a ToolSet.
 * Each agent becomes a tool that delegates to agent.run().
 *
 * @example
 * ```ts
 * const tools = agentsToTools({
 *   researcher: researcherAgent,
 *   writer: writerAgent,
 * });
 * // tools.researcher — calls researcherAgent.run(prompt)
 * // tools.writer — calls writerAgent.run(prompt)
 * ```
 */
export function agentsToTools(
  agents: Record<string, AgentInstance>,
): ToolSet {
  const tools: ToolSet = {};

  for (const [name, agent] of Object.entries(agents)) {
    const description =
      agent.config.description ??
      `Delegate task to the "${agent.config.name ?? name}" agent`;

    tools[name] = tool({
      description,
      parameters: z.object({
        prompt: z.string().describe("The task or question to delegate to this agent"),
      }),
      execute: async ({ prompt }) => {
        const result = await agent.run(prompt);
        return result.text;
      },
    });
  }

  return tools;
}
