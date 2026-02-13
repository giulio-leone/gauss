import { describe, it, expect, beforeEach } from "vitest";
import { createStreamableHttpHandler } from "../streamable-http-handler.js";
import { McpServer } from "../mcp-server.js";
import type { Tool } from "ai";

describe("createStreamableHttpHandler", () => {
  let handler: (request: Request) => Promise<Response>;

  beforeEach(() => {
    const server = new McpServer({
      name: "test",
      version: "0.1.0",
      tools: {} as Record<string, Tool>,
    });
    handler = createStreamableHttpHandler({ server });
  });

  it("returns 405 for GET requests", async () => {
    const res = await handler(new Request("http://localhost", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("returns 400 for POST with malformed JSON", async () => {
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: "not-json",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe(-32700);
  });

  it("handles initialize and returns session id", async () => {
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
    const json = await res.json();
    expect(json.result.serverInfo.name).toBe("test");
  });

  it("returns 401 for non-init request without session", async () => {
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("allows non-init request with valid session", async () => {
    // First initialize
    const initRes = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;

    // Then list tools
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for DELETE with invalid session", async () => {
    const res = await handler(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Mcp-Session-Id": "invalid" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 for DELETE with valid session", async () => {
    // Initialize
    const initRes = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;

    // Delete
    const res = await handler(
      new Request("http://localhost", {
        method: "DELETE",
        headers: { "Mcp-Session-Id": sessionId },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns 202 for notification (no id)", async () => {
    // Initialize first
    const initRes = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const sessionId = initRes.headers.get("mcp-session-id")!;

    // Send notification
    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        headers: { "Content-Type": "application/json", "Mcp-Session-Id": sessionId },
      }),
    );
    expect(res.status).toBe(202);
  });
});
