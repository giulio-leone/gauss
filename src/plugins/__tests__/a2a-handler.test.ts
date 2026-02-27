import { describe, expect, it, vi } from "vitest";

import {
  createA2AHttpHandler,
  createA2AJsonRpcHandler,
  type A2AJsonRpcRequest,
  type A2ATask,
  type A2ATaskEvent,
} from "../a2a-handler.js";

function createTask(id: string, prompt: string, status: A2ATask["status"] = "completed"): A2ATask {
  const now = new Date(0).toISOString();
  return {
    id,
    status,
    prompt,
    output: status === "completed" ? `done:${prompt}` : undefined,
    createdAt: now,
    updatedAt: now,
    completedAt: status === "completed" ? now : undefined,
  };
}

describe("A2A handler", () => {
  it("returns method-not-found for unknown JSON-RPC methods", async () => {
    const handler = createA2AJsonRpcHandler({
      sendTask: async ({ prompt, taskId }) => createTask(taskId ?? "t-1", prompt),
      getTask: async () => null,
    });

    const response = await handler({
      jsonrpc: "2.0",
      id: "x-1",
      method: "tasks/unknown",
    });

    expect(response.error?.code).toBe(-32601);
  });

  it("validates tasks/send input and returns invalid params", async () => {
    const handler = createA2AJsonRpcHandler({
      sendTask: async ({ prompt, taskId }) => createTask(taskId ?? "t-2", prompt),
      getTask: async () => null,
    });

    const response = await handler({
      jsonrpc: "2.0",
      id: "x-2",
      method: "tasks/send",
      params: {},
    });

    expect(response.error?.code).toBe(-32602);
  });

  it("supports JSON-RPC notifications over HTTP (no id)", async () => {
    const sendTaskSpy = vi.fn(async ({ prompt, taskId }: { prompt: string; taskId?: string }) =>
      createTask(taskId ?? "notif-1", prompt),
    );

    const jsonRpcHandler = createA2AJsonRpcHandler({
      sendTask: sendTaskSpy,
      getTask: async () => null,
    });

    const httpHandler = createA2AHttpHandler(jsonRpcHandler);

    const request = new Request("https://example.test/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tasks/send",
        params: { prompt: "run as notification" },
      } satisfies Omit<A2AJsonRpcRequest, "id">),
    });

    const response = await httpHandler(request);
    expect(response.status).toBe(202);
    expect(sendTaskSpy).toHaveBeenCalledTimes(1);
  });

  it("streams SSE events for tasks/sendSubscribe", async () => {
    const jsonRpcHandler = createA2AJsonRpcHandler({
      sendTask: async ({ prompt, taskId }) => createTask(taskId ?? "sse-1", prompt),
      getTask: async () => null,
      getAgentCard: async () => ({ name: "SSE Agent", instructions: "", tools: [] }),
    });

    const events: A2ATaskEvent[] = [
      {
        type: "task:queued",
        taskId: "sse-task",
        task: createTask("sse-task", "do work", "queued"),
        timestamp: new Date(1).toISOString(),
      },
      {
        type: "task:completed",
        taskId: "sse-task",
        task: createTask("sse-task", "do work", "completed"),
        timestamp: new Date(2).toISOString(),
      },
    ];

    const httpHandler = createA2AHttpHandler(jsonRpcHandler, {
      sendTaskSubscribe: async function* () {
        for (const event of events) {
          yield event;
        }
      },
    });

    const request = new Request("https://example.test/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sse-call",
        method: "tasks/sendSubscribe",
        params: { prompt: "do work" },
      }),
    });

    const response = await httpHandler(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const body = await response.text();
    expect(body).toContain("event: task:queued");
    expect(body).toContain("event: task:completed");
  });

  it("serves discovery card from getAgentCard", async () => {
    const jsonRpcHandler = createA2AJsonRpcHandler({
      sendTask: async ({ prompt, taskId }) => createTask(taskId ?? "disc-1", prompt),
      getTask: async () => null,
      getAgentCard: async () => ({
        name: "Discovery Agent",
        instructions: "Coordinate tasks",
        tools: ["search", "summarize"],
      }),
    });

    const httpHandler = createA2AHttpHandler(jsonRpcHandler);

    const response = await httpHandler(
      new Request("https://example.test/.well-known/agent.json", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    const card = await response.json() as {
      name: string;
      capabilities: { streaming: boolean };
      skills: unknown[];
    };
    expect(card.name).toBe("Discovery Agent");
    expect(card.capabilities.streaming).toBe(true);
    expect(card.skills).toHaveLength(2);
  });
});
