// =============================================================================
// Template: MCP Server/Client — Model Context Protocol integration
// =============================================================================
// gauss init --template mcp
//
// Agent that exposes tools via MCP and connects to MCP servers.
// =============================================================================

import { agent } from "gauss";
import { openai } from "gauss/providers";
import { tool } from "../../core/llm/index.js";
import { z } from "zod";

// ─── MCP Client: Connect to an MCP server ────────────────────────────────────

const mcpAgent = agent({
  model: openai("gpt-5.2"),
  instructions: `You are an assistant connected to external MCP tools.
Use available tools to help users accomplish their tasks.`,
  // Connect to an MCP server (e.g., filesystem, database, or custom)
  // mcpServers: [
  //   { url: "http://localhost:3001/mcp" },
  // ],
}).build();

// ─── MCP Server: Expose your agent as an MCP endpoint ─────────────────────────

// Define tools that will be exposed via MCP
const searchTool = tool({
  description: "Search the knowledge base",
  parameters: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().default(5).describe("Max results"),
  }),
  execute: async ({ query, limit }) => {
    // Replace with your actual search logic
    return {
      results: [
        { title: `Result for "${query}"`, score: 0.95 },
      ],
      total: 1,
    };
  },
});

const serverAgent = agent({
  model: openai("gpt-5.2-mini"),
  instructions: "You are a knowledge base assistant.",
  tools: { search: searchTool },
}).build();

// To expose as MCP server, use the REST adapter:
// import { GaussServer } from 'gauss/server'
// const server = new GaussServer({ agent: serverAgent, port: 3001 })
// await server.start()

// Example: Run locally
const result = await mcpAgent.run("Help me find information about AI agents");
console.log(result.text);
