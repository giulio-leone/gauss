// 08 — Expose DeepAgent as an A2A JSON-RPC HTTP server
// Usage: npx tsx examples/08-a2a-server.ts

import { createServer, type IncomingMessage } from "node:http";

import {
  A2APlugin,
  AgentCardPlugin,
  DeepAgent,
} from "@onegenui/agent";

const model = {} as import("ai").LanguageModel;

function shouldIncludeBody(method: string | undefined, body: string): boolean {
  if (!body) return false;
  if (!method) return true;
  return method !== "GET" && method !== "HEAD";
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  const agentCard = new AgentCardPlugin();
  const a2a = new A2APlugin({ agentCardProvider: agentCard });

  const agent = DeepAgent.create({
    model,
    instructions: "You are a distributed task coordinator.",
    maxSteps: 30,
  })
    .withPlanning()
    .use(agentCard)
    .use(a2a)
    .build();

  const a2aHandler = a2a.createHttpHandler(agent);
  const port = Number(process.env.PORT ?? 8787);

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const url = `http://localhost:${port}${req.url ?? "/"}`;

    const request = new Request(url, {
      method: req.method ?? "POST",
      headers: req.headers as HeadersInit,
      body: shouldIncludeBody(req.method, body) ? body : undefined,
    });

    const response = await a2aHandler(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.end(await response.text());
  });

  server.listen(port, () => {
    console.log(`A2A server listening on http://localhost:${port}`);
    console.log("Try JSON-RPC method: tasks/send");
  });
}

main().catch(console.error);
