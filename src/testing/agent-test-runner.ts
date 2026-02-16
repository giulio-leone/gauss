// =============================================================================
// Agent Test Runner — Run a DeepAgent and collect results
// =============================================================================

import type { DeepAgent, DeepAgentResult } from "../agent/deep-agent.js";

export interface AgentTestResult {
  response: string;
  toolCalls: Array<{ name: string; args: unknown; result: unknown }>;
  tokenUsage: { input: number; output: number };
  duration: number;
  steps: number;
}

export async function runAgentTest(config: {
  agent: DeepAgent;
  prompt: string;
  maxSteps?: number;
}): Promise<AgentTestResult> {
  const { agent, prompt } = config;

  const toolCalls: AgentTestResult["toolCalls"] = [];
  let tokenInput = 0;
  let tokenOutput = 0;

  // Listen for step events to capture tool calls
  const stepHandler = (event: { type: string; data: unknown }) => {
    const data = event.data as Record<string, unknown>;
    const step = data?.step as Record<string, unknown> | undefined;
    if (!step) return;

    // Extract tool calls from step data
    const calls = step.toolCalls as Array<Record<string, unknown>> | undefined;
    const results = step.toolResults as Array<Record<string, unknown>> | undefined;

    if (calls) {
      for (let i = 0; i < calls.length; i++) {
        const call = calls[i]!;
        const result = results?.[i];
        toolCalls.push({
          name: call.toolName as string,
          args: call.args,
          result: result?.result ?? undefined,
        });
      }
    }
  };

  agent.eventBus.on("step:end", stepHandler);

  const start = Date.now();
  let result: DeepAgentResult;

  try {
    result = await agent.run(prompt);
  } finally {
    agent.eventBus.off("step:end", stepHandler);
  }

  const duration = Date.now() - start;

  // Extract token usage from steps if available
  for (const step of result.steps) {
    const s = step as Record<string, unknown>;
    const usage = s.usage as { promptTokens?: number; completionTokens?: number } | undefined;
    if (usage) {
      tokenInput += usage.promptTokens ?? 0;
      tokenOutput += usage.completionTokens ?? 0;
    }
  }

  return {
    response: result.text,
    toolCalls,
    tokenUsage: { input: tokenInput, output: tokenOutput },
    duration,
    steps: result.steps.length,
  };
}
