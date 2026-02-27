import { describe, expect, it, vi } from "vitest";

import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import type { PluginContext, PluginSetupContext } from "../../ports/plugin.port.js";
import type { A2ATask } from "../a2a-handler.js";
import { A2APlugin } from "../a2a.plugin.js";

function createSetupContext(): PluginSetupContext {
  return {
    sessionId: "session-a2a",
    agentName: "A2A Agent",
    config: {
      instructions: "Coordinate tasks across agent boundaries.",
      maxSteps: 12,
    },
    filesystem: new VirtualFilesystem(),
    memory: new InMemoryAdapter(),
    toolNames: ["a2a:call", "read_file"],
    on: () => () => {
      // no-op
    },
  };
}

function createRunContext(
  setupCtx: PluginSetupContext,
  metadata: Record<string, unknown>,
): PluginContext {
  return {
    sessionId: setupCtx.sessionId,
    agentName: setupCtx.agentName,
    config: setupCtx.config,
    filesystem: setupCtx.filesystem,
    memory: setupCtx.memory,
    toolNames: setupCtx.toolNames,
    runMetadata: metadata,
  };
}

describe("A2APlugin", () => {
  it("registers a2a:call tool and performs remote JSON-RPC call", async () => {
    const fetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: "1", result: { ok: true } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const plugin = new A2APlugin({
      fetch: fetchSpy as unknown as typeof fetch,
    });

    const callTool = plugin.tools["a2a:call"] as {
      execute?: (args: unknown) => Promise<unknown>;
    };

    const result = await callTool.execute?.({
      endpoint: "https://agents.example.com/a2a",
      method: "tasks/send",
      prompt: "Summarize release blockers",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("handles tasks/send and tasks/get through JSON-RPC handler", async () => {
    const setupCtx = createSetupContext();
    const plugin = new A2APlugin({
      fetch: vi.fn() as unknown as typeof fetch,
    });

    plugin.setup(setupCtx);

    const runSpy = vi.fn(async (prompt: string, options?: { pluginMetadata?: Record<string, unknown> }) => {
      const runCtx = createRunContext(setupCtx, options?.pluginMetadata ?? {});
      await plugin.hooks.beforeRun?.(runCtx, { prompt });

      const result = {
        text: `Completed: ${prompt}`,
        steps: [],
        toolCalls: [],
        sessionId: setupCtx.sessionId,
      };

      await plugin.hooks.afterRun?.(runCtx, { result });
      return result;
    });

    const handler = plugin.createJsonRpcHandler({
      sessionId: setupCtx.sessionId,
      run: runSpy,
    });

    const sendResponse = await handler({
      jsonrpc: "2.0",
      id: 1,
      method: "tasks/send",
      params: { prompt: "Generate migration plan" },
    });

    expect(sendResponse.error).toBeUndefined();
    expect(runSpy).toHaveBeenCalledTimes(1);

    const task = sendResponse.result as A2ATask;
    expect(task.status).toBe("completed");
    expect(task.output).toContain("Generate migration plan");

    const getResponse = await handler({
      jsonrpc: "2.0",
      id: 2,
      method: "tasks/get",
      params: { taskId: task.id },
    });

    const fetched = getResponse.result as A2ATask;
    expect(fetched.id).toBe(task.id);
    expect(fetched.status).toBe("completed");
  });

  it("uses AgentCard provider for discovery endpoint", async () => {
    const provider = {
      getAgentCard: vi.fn(async () => ({
        agentsMd: "# Agent Card",
        skillsMd: "# Skills Card",
        source: {
          agents: "auto" as const,
          skills: "auto" as const,
        },
      })),
    };

    const plugin = new A2APlugin({
      fetch: vi.fn() as unknown as typeof fetch,
      agentCardProvider: provider,
    });
    plugin.setup(createSetupContext());

    const handler = plugin.createJsonRpcHandler({
      sessionId: "session-a2a",
      run: async () => ({ text: "ok", steps: [], toolCalls: [], sessionId: "session-a2a" }),
    });

    const response = await handler({
      jsonrpc: "2.0",
      id: "card",
      method: "agent/card",
    });

    expect(provider.getAgentCard).toHaveBeenCalledTimes(1);
    expect(response.result).toMatchObject({ agentsMd: "# Agent Card" });
  });
});
