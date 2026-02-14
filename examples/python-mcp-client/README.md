# Python MCP Client Example

Connects to a `@onegenui/agent` MCP server via Streamable HTTP and demonstrates tool discovery and execution.

## Prerequisites

```bash
pip install httpx
```

## Usage

**1. Start the MCP server** (from the repo root):

```ts
// server.ts
import { DeepAgent } from '@onegenui/agent';
import { McpServer, createStreamableHttpHandler } from '@onegenui/agent/server';
import { openai } from '@ai-sdk/openai';

const agent = DeepAgent.minimal({
  model: openai('gpt-4o'),
  instructions: 'You are a coding assistant.',
});

const server = new McpServer({ name: 'my-agent', version: '1.0.0', tools: agent.tools });
const handler = createStreamableHttpHandler({ server });

Bun.serve({ port: 3000, fetch: handler });
console.log('MCP server listening on http://localhost:3000');
```

```bash
bun run server.ts
# or: npx tsx server.ts (with a Node.js HTTP adapter)
```

**2. Run the Python client:**

```bash
python example.py
# or with a custom URL:
python example.py http://localhost:8080
```

## What it does

1. **Initialize** — opens a session, receives `mcp-session-id`
2. **List tools** — discovers all agent tools (ls, read_file, write_file, etc.)
3. **Call a tool** — calls `ls` on the root directory as a demo
4. **Close session** — sends DELETE to clean up
