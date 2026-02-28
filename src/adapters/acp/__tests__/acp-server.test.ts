import { describe, it, expect } from "vitest";
import { AcpServer } from "../acp-server.js";
import type { AcpHandler, AcpSession } from "../../../ports/acp.port.js";

describe("AcpServer", () => {
  it("starts and stops cleanly", async () => {
    const server = new AcpServer();
    expect(server.isRunning()).toBe(false);

    await server.start();
    expect(server.isRunning()).toBe(true);

    await server.stop();
    expect(server.isRunning()).toBe(false);
  });

  it("handles initialize → creates session", async () => {
    const server = new AcpServer();
    await server.start();

    const response = await server.processMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { agentName: "test-agent" },
      }),
    );

    expect(response.result).toBeDefined();
    const result = response.result as Record<string, unknown>;
    expect(result.sessionId).toMatch(/^acp-/);
    expect(result.capabilities).toEqual({
      streaming: true,
      tools: true,
      memory: true,
    });

    expect(server.getSessions()).toHaveLength(1);
  });

  it("handles shutdown → removes session", async () => {
    const server = new AcpServer();
    await server.start();

    // Initialize
    const initResp = await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    );
    const sessionId = (initResp.result as any).sessionId;

    // Shutdown
    const shutResp = await server.processMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "shutdown",
        params: { sessionId },
      }),
    );

    expect(shutResp.result).toEqual({ success: true });
    expect(server.getSessions()).toHaveLength(0);
  });

  it("dispatches to registered handler", async () => {
    const server = new AcpServer();
    await server.start();

    // Initialize a session
    await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
    );

    // Register a handler
    const handler: AcpHandler = {
      async handle(method: string, params: unknown, _session: AcpSession) {
        if (method === "agent/run") {
          const p = params as Record<string, unknown>;
          return { output: `Processed: ${p.input}` };
        }
        return undefined;
      },
    };
    server.registerHandler(handler);

    const resp = await server.processMessage(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "agent/run",
        params: { input: "hello" },
      }),
    );

    expect(resp.result).toEqual({ output: "Processed: hello" });
  });

  it("returns error for invalid JSON", async () => {
    const server = new AcpServer();
    const resp = await server.processMessage("not json");
    expect(resp.error?.code).toBe(-32700);
  });

  it("returns error for missing method", async () => {
    const server = new AcpServer();
    const resp = await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1 }),
    );
    expect(resp.error?.code).toBe(-32600);
  });

  it("returns error for unknown method with no handler", async () => {
    const server = new AcpServer();
    await server.start();

    // Need a session
    await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
    );

    const resp = await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "unknown/method" }),
    );

    expect(resp.error?.code).toBe(-32601);
    expect(resp.error?.message).toContain("Method not found");
  });

  it("returns error when handler throws", async () => {
    const server = new AcpServer();
    await server.start();

    await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
    );

    server.registerHandler({
      async handle() {
        throw new Error("Handler exploded");
      },
    });

    const resp = await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "agent/crash" }),
    );

    expect(resp.error?.code).toBe(-32603);
    expect(resp.error?.message).toBe("Handler exploded");
  });

  it("returns no-session error when not initialized", async () => {
    const server = new AcpServer();
    const resp = await server.processMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "agent/run" }),
    );
    expect(resp.error?.code).toBe(-32001);
  });

  it("processes batch messages", async () => {
    const server = new AcpServer();
    await server.start();

    const results = await server.processBatch([
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "shutdown", params: {} }),
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].result).toBeDefined();
  });
});
