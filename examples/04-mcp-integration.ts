// =============================================================================
// 04 — MCP (Model Context Protocol) Server
// =============================================================================
//
// Creates an MCP server with tools, resources, and prompts. The server can
// handle incoming JSON-RPC messages from any MCP-compatible client.
//
// Usage: npx tsx examples/04-mcp-integration.ts

import { McpServer } from "gauss-ai";

async function main(): Promise<void> {
  const mcp = new McpServer("my-tools", "1.0.0");

  // ── Register tools ─────────────────────────────────────────────────
  mcp.addTool({
    name: "get_weather",
    description: "Get current weather for a location",
    parameters: {
      location: { type: "string", description: "City name" },
      units: { type: "string", enum: ["celsius", "fahrenheit"] },
    },
  });

  mcp.addTool({
    name: "search_docs",
    description: "Search internal documentation",
    parameters: {
      query: { type: "string" },
      limit: { type: "number" },
    },
  });

  // ── Register resources ─────────────────────────────────────────────
  mcp.addResource({
    uri: "file:///config/app.json",
    name: "App Configuration",
    description: "Current application configuration",
    mimeType: "application/json",
  });

  // ── Register prompts ───────────────────────────────────────────────
  mcp.addPrompt({
    name: "summarize",
    description: "Summarize a document",
    arguments: [
      { name: "text", description: "Text to summarize", required: true },
      { name: "style", description: "Summary style (brief/detailed)" },
    ],
  });

  // ── Handle an incoming MCP message (JSON-RPC) ──────────────────────
  const response = await mcp.handleMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
  console.log("MCP tools/list response:", JSON.stringify(response, null, 2));

  mcp.destroy();
}

main().catch(console.error);
