// 07 — Plugin System basics with custom plugin + AgentCardPlugin
// Usage: npx tsx examples/07-plugin-system.ts

import { tool } from "ai";
import { z } from "zod";

import {
  AgentCardPlugin,
  DeepAgent,
  type DeepAgentPlugin,
} from "@giulio-leone/gaussflow-agent";

const model = {} as import("ai").LanguageModel;

const observabilityPlugin: DeepAgentPlugin = {
  name: "observability",
  tools: {
    "ops:health": tool({
      description: "Return health status for operational checks",
      inputSchema: z.object({}),
      execute: async () => ({ status: "ok", checkedAt: new Date().toISOString() }),
    }),
  },
  hooks: {
    beforeRun: async (_ctx, params) => ({
      prompt: `[trace-enabled] ${params.prompt}`,
    }),
    afterRun: async (_ctx, params) => {
      console.log("[plugin] response size:", params.result.text.length);
    },
  },
};

async function main(): Promise<void> {
  const agentCard = new AgentCardPlugin({
    overrides: {
      agents: {
        summary: "Production orchestrator with plugin extensions.",
      },
    },
  });

  const agent = DeepAgent.create({
    model,
    instructions: "You are an ops coordinator. Prefer deterministic execution.",
    maxSteps: 20,
  })
    .withPlanning()
    .use(observabilityPlugin)
    .use(agentCard)
    .build();

  const result = await agent.run("Create a release checklist for sprint 42");
  const card = await agentCard.getAgentCard();

  console.log("Result:", result.text);
  console.log("Agents card source:", card.source.agents);
  console.log("Agents card preview:");
  console.log(card.agentsMd.split("\n").slice(0, 12).join("\n"));

  await agent.dispose();
}

main().catch(console.error);
