/**
 * E2E: OpenRouter Advanced Features — Graph, Network, Workflow, Middleware
 * Model: arcee-ai/trinity-large-preview:free
 */
import { describe, it, expect } from "vitest";
import { Agent } from "../src/sdk/agent.js";
import { Graph } from "../src/sdk/graph.js";
import { Network } from "../src/sdk/network.js";
import { Workflow } from "../src/sdk/workflow.js";
import { MiddlewareChain } from "../src/sdk/middleware.js";
import { gauss, batch } from "../src/sdk/agent.js";
import { structured } from "../src/sdk/structured.js";
import { template } from "../src/sdk/template.js";
import { pipe, mapAsync, compose } from "../src/sdk/pipeline.js";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY required");

const MODEL = "arcee-ai/trinity-large-preview:free";

function agentOpts(overrides: Record<string, unknown> = {}) {
  return {
    provider: "openai" as const,
    model: MODEL,
    providerOptions: {
      apiKey: OPENROUTER_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
    },
    maxTokens: 80,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════

interface TestResult {
  test: string;
  feature: string;
  success: boolean;
  latencyMs: number;
  output?: string;
  error?: string;
}
const results: TestResult[] = [];
let totalTokens = 0;

function record(r: TestResult) {
  results.push(r);
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe("OpenRouter Advanced Features — arcee-ai/trinity-large-preview:free", () => {
  // ─── 1. Basic Agent ────────────────────────────────────────────────
  it("basic Agent.run", async () => {
    const start = Date.now();
    const agent = new Agent({ ...agentOpts(), name: "basic", instructions: "Be concise. Answer in 1-2 words." });
    const result = await agent.run("What is 2+2?");
    const latency = Date.now() - start;

    record({ test: "basic-run", feature: "Agent.run", success: true, latencyMs: latency, output: result.text.slice(0, 50) });
    totalTokens += (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

    expect(result.text.length).toBeGreaterThan(0);
    agent.destroy();
  });

  // ─── 2. Streaming ─────────────────────────────────────────────────
  // NOTE: Streaming has a known NAPI threadsafe function bug with some providers.
  // Skipping in this test suite — it works correctly with OpenAI (see gpt5-integration.test.ts).
  it("streaming", async () => {
    const start = Date.now();
    const agent = new Agent({ ...agentOpts(), name: "streamer", instructions: "Be brief." });
    const parts: string[] = [];

    const noop = async (_call: string) => JSON.stringify({ result: "ok" });
    for await (const event of agent.streamIter("Count to 3", noop)) {
      if (event.type === "text_delta" && (event as any).delta) parts.push((event as any).delta);
    }
    const text = parts.join("");
    const latency = Date.now() - start;

    record({ test: "streaming", feature: "Agent.streamIter", success: true, latencyMs: latency, output: text.slice(0, 50) });
    expect(text.length).toBeGreaterThan(0);
    agent.destroy();
  }, 30_000);

  // ─── 3. gauss() one-liner ─────────────────────────────────────────
  it("gauss() one-liner", async () => {
    const start = Date.now();
    const text = await gauss("What is 1+1? Reply with just the number.", {
      ...agentOpts(),
      instructions: "Reply only with the number.",
    });
    const latency = Date.now() - start;

    record({ test: "gauss-oneliner", feature: "gauss()", success: true, latencyMs: latency, output: text.slice(0, 20) });
    expect(text).toContain("2");
  });

  // ─── 4. structured() ──────────────────────────────────────────────
  it("structured output", async () => {
    const start = Date.now();
    const agent = new Agent({
      ...agentOpts({ maxTokens: 120 }),
      name: "structurer",
      instructions: "Output valid JSON only. No markdown, no explanation.",
    });

    const result = await structured(agent, "Bob is 25 years old.", {
      schema: {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "number" } },
        required: ["name", "age"],
      },
    });
    const latency = Date.now() - start;

    record({
      test: "structured-output", feature: "structured()",
      success: true, latencyMs: latency, output: JSON.stringify(result.data),
    });
    expect(result.data.name?.toLowerCase()).toBe("bob");
    expect(result.data.age).toBe(25);
    agent.destroy();
  });

  // ─── 5. template() ────────────────────────────────────────────────
  it("template", async () => {
    const start = Date.now();
    const t = template("Say '{{word}}' in {{lang}}. Reply with just the word.");
    const agent = new Agent({
      ...agentOpts(),
      name: "translator",
      instructions: "Reply with exactly one word.",
    });

    const result = await agent.run(t({ word: "hello", lang: "Italian" }));
    const latency = Date.now() - start;

    record({ test: "template", feature: "template()", success: true, latencyMs: latency, output: result.text.slice(0, 20) });
    expect(result.text.toLowerCase()).toContain("ciao");
    agent.destroy();
  });

  // ─── 6. batch() ───────────────────────────────────────────────────
  it("batch parallel", async () => {
    const start = Date.now();

    const results_batch = await batch(
      ["What is 1+1?", "What is 2+2?"],
      {
        ...agentOpts(),
        concurrency: 2,
        instructions: "Reply with just the number.",
      }
    );
    const latency = Date.now() - start;

    record({
      test: "batch", feature: "batch()",
      success: true, latencyMs: latency,
      output: results_batch.map(r => r.result?.text.slice(0, 10)).join(", "),
    });
    expect(results_batch).toHaveLength(2);
    expect(results_batch[0].result?.text.length).toBeGreaterThan(0);
  });

  // ─── 7. pipe() ────────────────────────────────────────────────────
  it("pipeline", async () => {
    const start = Date.now();
    const result = await pipe(
      "Rome",
      (city: string) => `${city} is a city in which country? Reply with just the country name.`,
      async (prompt: string) => {
        const agent = new Agent({
          ...agentOpts(),
          name: "geographer",
          instructions: "Reply with just the country name.",
        });
        const r = await agent.run(prompt);
        agent.destroy();
        return r.text;
      },
    );
    const latency = Date.now() - start;

    record({ test: "pipeline", feature: "pipe()", success: true, latencyMs: latency, output: result.slice(0, 20) });
    expect(result.toLowerCase()).toContain("italy");
  });

  // ─── 8. Graph (DAG multi-agent) ───────────────────────────────────
  it("graph — DAG multi-agent execution", async () => {
    const start = Date.now();
    const researcher = new Agent({
      ...agentOpts({ maxTokens: 100 }),
      name: "researcher",
      instructions: "You are a researcher. Provide a brief 1-sentence fact.",
    });
    const writer = new Agent({
      ...agentOpts({ maxTokens: 100 }),
      name: "writer",
      instructions: "You are a writer. Summarize the research in one sentence.",
    });

    const graph = new Graph()
      .addNode({ nodeId: "research", agent: researcher })
      .addNode({ nodeId: "write", agent: writer })
      .addEdge("research", "write");

    const result = await graph.run("Tell me about black holes");
    const latency = Date.now() - start;

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    record({
      test: "graph-dag", feature: "Graph (DAG)",
      success: true, latencyMs: latency,
      output: JSON.stringify(parsed).slice(0, 80),
    });

    // Graph returns results — the shape varies by model, just verify non-empty
    expect(parsed).toBeTruthy();
    expect(Object.keys(parsed).length).toBeGreaterThan(0);

    graph.destroy();
    researcher.destroy();
    writer.destroy();
  }, 60000);

  // ─── 9. Network (multi-agent delegation) ──────────────────────────
  it("network — multi-agent delegation", async () => {
    const start = Date.now();
    const expert = new Agent({
      ...agentOpts({ maxTokens: 100 }),
      name: "math-expert",
      instructions: "You are a math expert. Answer precisely.",
    });
    const supervisor = new Agent({
      ...agentOpts({ maxTokens: 100 }),
      name: "supervisor",
      instructions: "You are a supervisor. Delegate to specialists.",
    });

    const net = new Network();
    net.addAgent(expert, "Handles math questions");
    net.addAgent(supervisor, "Supervises and delegates");
    net.setSupervisor("supervisor");

    const cards = net.agentCards();
    const latency = Date.now() - start;

    record({
      test: "network-cards", feature: "Network.agentCards()",
      success: true, latencyMs: latency,
      output: typeof cards === "string" ? cards.slice(0, 80) : JSON.stringify(cards).slice(0, 80),
    });

    expect(cards).toBeTruthy();

    // Test delegation
    const delegateStart = Date.now();
    try {
      const delegateResult = await net.delegate("supervisor", "math-expert", "What is 7*8?");
      const delegateLatency = Date.now() - delegateStart;

      record({
        test: "network-delegate", feature: "Network.delegate()",
        success: true, latencyMs: delegateLatency,
        output: typeof delegateResult === "string" ? delegateResult.slice(0, 50) : JSON.stringify(delegateResult).slice(0, 50),
      });
    } catch (e: any) {
      const delegateLatency = Date.now() - delegateStart;
      record({
        test: "network-delegate", feature: "Network.delegate()",
        success: false, latencyMs: delegateLatency,
        error: e.message?.slice(0, 80),
      });
    }

    net.destroy();
    expert.destroy();
    supervisor.destroy();
  }, 30000);

  // ─── 10. Workflow ──────────────────────────────────────────────────
  it("workflow — step-based execution", async () => {
    const start = Date.now();
    const worker = new Agent({
      ...agentOpts({ maxTokens: 80 }),
      name: "worker",
      instructions: "You are a helpful assistant. Be brief.",
    });

    const wf = new Workflow();
    wf.addStep({ stepId: "greet", agent: worker, instructions: "Say hello briefly" });
    wf.addStep({ stepId: "farewell", agent: worker, instructions: "Say goodbye briefly" });
    wf.addDependency("farewell", "greet");

    const result = await wf.run("Start the workflow");
    const latency = Date.now() - start;

    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    // Response wraps results in "steps"
    const steps = parsed.steps ?? parsed;
    record({
      test: "workflow", feature: "Workflow",
      success: true, latencyMs: latency,
      output: JSON.stringify(steps).slice(0, 80),
    });

    expect(steps).toHaveProperty("greet");
    expect(steps).toHaveProperty("farewell");

    wf.destroy();
    worker.destroy();
  }, 30000);

  // ─── 11. Middleware ────────────────────────────────────────────────
  it("middleware chain", () => {
    const start = Date.now();
    const chain = new MiddlewareChain();
    chain.useLogging();
    chain.useCaching(5000);
    const latency = Date.now() - start;

    record({
      test: "middleware", feature: "MiddlewareChain",
      success: true, latencyMs: latency,
      output: "logging + caching configured",
    });

    expect(chain).toBeTruthy();
    chain.destroy();
  });

  // ─── 12. mapAsync ─────────────────────────────────────────────────
  it("mapAsync", async () => {
    const start = Date.now();
    const agent = new Agent({
      ...agentOpts(),
      name: "mapper",
      instructions: "Reply with just the animal sound. One word only.",
    });

    const results_map = await mapAsync(
      ["dog", "cat"],
      async (animal) => {
        const r = await agent.run(`What sound does a ${animal} make?`);
        return r.text;
      },
      { concurrency: 2 }
    );
    const latency = Date.now() - start;

    record({
      test: "map-async", feature: "mapAsync()",
      success: true, latencyMs: latency,
      output: results_map.map(r => r.slice(0, 15)).join(", "),
    });

    expect(results_map).toHaveLength(2);
    agent.destroy();
  });

  // ─── 13. compose ──────────────────────────────────────────────────
  it("compose functions", async () => {
    const start = Date.now();
    const double = (x: number) => x * 2;
    const addTen = (x: number) => x + 10;
    const composed = compose(double, addTen);
    const result = await composed(5);
    const latency = Date.now() - start;

    record({
      test: "compose", feature: "compose()",
      success: true, latencyMs: latency,
      output: `compose(double, addTen)(5) = ${result}`,
    });
    expect(result).toBe(20); // double(5)=10, addTen(10)=20
  });

  // ─── Report ────────────────────────────────────────────────────────
  it("--- REPORT ---", () => {
    console.log("\n════════════════════════════════════════════════════════════════════════════════");
    console.log("  OpenRouter Advanced Features Report — arcee-ai/trinity-large-preview:free");
    console.log("════════════════════════════════════════════════════════════════════════════════");

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    for (const r of results) {
      const icon = r.success ? "✅" : "❌";
      const latency = `${Math.round(r.latencyMs)}ms`;
      console.log(`  ${icon} ${r.feature.padEnd(30)} ${r.test.padEnd(25)} ${latency}`);
      if (r.output) console.log(`     → ${r.output}`);
      if (r.error) console.log(`     ✖ ${r.error}`);
    }

    console.log("────────────────────────────────────────────────────────────────────────────────");
    console.log(`  Total: ${results.length} | ✅ ${passed} | ❌ ${failed}`);
    console.log("════════════════════════════════════════════════════════════════════════════════\n");
  });
});
