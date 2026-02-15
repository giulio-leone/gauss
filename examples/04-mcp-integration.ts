// =============================================================================
// 04 — Agent with MCP server integration
// =============================================================================
//
// Shows how to connect external MCP servers so the agent can discover and
// invoke their tools. Tools are namespaced as `mcp:<server>:<tool>`.
//
// Requires: @ai-sdk/mcp (pnpm add @ai-sdk/mcp)
// Usage:    npx tsx examples/04-mcp-integration.ts

// import { openai } from "@ai-sdk/openai";
// const model = openai("gpt-4o");

import { DeepAgent, AiSdkMcpAdapter } from "@giulio-leone/gaussflow-agent";
import type { McpServerConfig } from "@giulio-leone/gaussflow-agent";

const model = {} as import("ai").LanguageModel;

async function main(): Promise<void> {
  // -- Configure MCP servers --------------------------------------------------
  const servers: McpServerConfig[] = [
    {
      id: "filesystem",
      name: "Filesystem Server",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/workspace"],
    },
    {
      id: "search",
      name: "Search Server",
      transport: "sse",
      url: "http://localhost:8080/sse",
    },
  ];

  // -- Create the MCP adapter and connect servers ----------------------------
  const mcp = new AiSdkMcpAdapter({ servers });
  for (const server of servers) {
    await mcp.connect(server);
  }

  // Inspect discovered tools
  const tools = await mcp.discoverTools();
  console.log("Discovered MCP tools:", Object.keys(tools));

  // List connected servers
  const serverInfos = await mcp.listServers();
  for (const info of serverInfos) {
    console.log(`  ${info.id}: ${info.status} (${info.transport})`);
  }

  // -- Build agent with MCP tools available ----------------------------------
  const agent = DeepAgent.create({
    model,
    instructions: [
      "You have access to external tools via MCP servers.",
      "Use the filesystem tools to read and write files.",
      "Use the search tools to find information online.",
    ].join("\n"),
    maxSteps: 20,
  })
    .withMcp(mcp)
    .withPlanning()
    .build();

  const result = await agent.run(
    "List the files in /tmp/workspace and summarize their contents.",
  );

  console.log("Result:", result.text);

  // Cleanup disconnects all MCP servers
  await agent.dispose();
}

main().catch(console.error);
