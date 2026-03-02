# Gauss TS Cookbook

Practical recipes for building AI-powered applications with gauss-ts.

---

## Quick Start

### One-liner

```ts
import { gauss } from "gauss-ts";

const answer = await gauss("What is the capital of France?");
console.log(answer); // "Paris"
```

### Full Agent

```ts
import { Agent } from "gauss-ts";

const agent = new Agent("assistant", "openai", "gpt-4o", { apiKey: process.env.OPENAI_API_KEY });
agent.setOptions({ instructions: "You are a helpful assistant.", temperature: 0.7 });

const result = await agent.run([{ role: "user", content: "Explain quantum computing" }]);
console.log(result.text);
agent.destroy();
```

---

## Streaming

### Callback-based

```ts
const result = await agent.stream("Tell me a story", (eventJson) => {
  const event = JSON.parse(eventJson);
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
});
console.log("\n\nFinal:", result.text);
```

### Async Iterator

```ts
for await (const event of agent.streamIter("Tell me a joke")) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
}
```

---

## Tools

### Defining Tools

```ts
import { Agent, ToolDef } from "gauss-ts";

const weatherTool: ToolDef = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
  },
};

const agent = new Agent("weather-bot", "openai", "gpt-4o", { apiKey: "..." });
agent.addTool(weatherTool);
```

### Custom Tool Executor

```ts
const result = await agent.runWithTools(
  [{ role: "user", content: "What's the weather in Tokyo?" }],
  async (callJson) => {
    const { tool, args } = JSON.parse(callJson);
    if (tool === "get_weather") {
      return JSON.stringify({ temp: 22, unit: "C", condition: "sunny" });
    }
    return JSON.stringify({ error: "unknown tool" });
  }
);
console.log(result.text);
```

---

## Batch Processing

```ts
import { batch, BatchItem } from "gauss-ts";

const items: BatchItem[] = [
  { prompt: "Translate 'hello' to Spanish" },
  { prompt: "Translate 'hello' to French" },
  { prompt: "Translate 'hello' to Japanese" },
];

const results = await batch(agent, items, { concurrency: 3 });
results.forEach((r, i) => {
  console.log(`${items[i].prompt} → ${r.text}`);
});
```

---

## Structured Output

```ts
const agent = new Agent("extractor", "openai", "gpt-4o", { apiKey: "..." });
agent.setOptions({
  outputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      skills: { type: "array", items: { type: "string" } },
    },
    required: ["name", "age", "skills"],
  },
});

const result = await agent.run("Extract: John is 30, knows Python and Rust");
const data = JSON.parse(result.text);
// { name: "John", age: 30, skills: ["Python", "Rust"] }
```

---

## Teams

```ts
import { Team } from "gauss-ts";

const team = new Team("research-team");
team.addAgent(researcherHandle, "researcher");
team.addAgent(writerHandle, "writer");
team.setStrategy("sequential"); // or "parallel", "round_robin"

const result = await team.run("Write a report on AI trends");
console.log(result);
```

---

## Graph Pipelines

```ts
import { Graph } from "gauss-ts";

const graph = new Graph("pipeline");
graph.addNode("analyze", analyzerHandle);
graph.addNode("summarize", summarizerHandle);
graph.addEdge("analyze", "summarize");

const result = await graph.run("Raw data to process...");
console.log(result);
```

---

## Workflows

```ts
import { Workflow } from "gauss-ts";

const workflow = new Workflow("content-pipeline");
workflow.addStep("research", researcherHandle);
workflow.addStep("draft", writerHandle);
workflow.addStep("review", reviewerHandle);
workflow.addDependency("draft", "research");
workflow.addDependency("review", "draft");

const result = await workflow.run("Create a blog post about Rust");
console.log(result);
```

---

## Networks

```ts
import { Network } from "gauss-ts";

const network = new Network("multi-agent");
network.addAgent(coderHandle, "coder");
network.addAgent(reviewerHandle, "reviewer");
network.setSupervisor(supervisorHandle);

const result = await network.delegate("Build a REST API", "coder");
console.log(result);
```

---

## Memory & RAG

### Conversation Memory

```ts
import { Memory } from "gauss-ts";

const memory = new Memory();
await memory.store("user", "My name is Alice");
await memory.store("assistant", "Hello Alice!");

const context = await memory.recall("What's my name?");
console.log(context); // Returns relevant messages
```

### Vector Store

```ts
import { VectorStore } from "gauss-ts";

const store = new VectorStore();
await store.upsert([
  { id: "doc1", text: "Rust is a systems programming language" },
  { id: "doc2", text: "Python is great for data science" },
]);

const results = await store.search("systems programming", { topK: 1 });
console.log(results[0].text); // "Rust is a systems programming language"
```

---

## MCP Integration

```ts
import { McpServer } from "gauss-ts";

const server = new McpServer("my-tools");
server.addTool({
  name: "calculate",
  description: "Evaluate a math expression",
  parameters: { type: "object", properties: { expr: { type: "string" } } },
});

const response = await server.handle(requestJson);
```

---

## Middleware & Guardrails

### Content Filtering

```ts
import { GuardrailChain } from "gauss-ts";

const chain = new GuardrailChain();
chain.addContentModeration();
chain.addPiiDetection();
chain.addTokenLimit(4096);
```

### Resilience

```ts
import { createFallbackProvider, createCircuitBreaker } from "gauss-ts";

const fallback = createFallbackProvider([primaryHandle, backupHandle]);
const breaker = createCircuitBreaker(primaryHandle, {
  failureThreshold: 3,
  resetTimeout: 60000,
});
```

---

## Code Execution

```ts
import { Agent } from "gauss-ts";

// Sandboxed Python execution
const result = await Agent.executeCode("python", 'print("Hello from Python!")');
console.log(result.stdout); // "Hello from Python!"

// Check available runtimes
const runtimes = await Agent.availableRuntimes();
console.log(runtimes); // ["python", "javascript", "bash"]
```

---

## Prompt Templates

```ts
import { template } from "gauss-ts";

const greet = template("Hello {{name}}, you are {{age}} years old!");
const rendered = greet.render({ name: "Alice", age: "30" });
console.log(rendered); // "Hello Alice, you are 30 years old!"
console.log(greet.variables); // ["name", "age"]
```

---

## Pipeline Utilities

```ts
import { pipe, mapAsync, filterAsync, reduceAsync, compose } from "gauss-ts";

// Functional pipeline
const result = await pipe(
  [1, 2, 3, 4, 5],
  (nums) => mapAsync(nums, async (n) => n * 2),
  (nums) => filterAsync(nums, async (n) => n > 4),
  (nums) => reduceAsync(nums, async (acc, n) => acc + n, 0)
);
console.log(result); // 24

// Compose functions
const process = compose(
  (text: string) => text.toLowerCase(),
  (text: string) => text.trim(),
  (text: string) => text.replace(/\s+/g, " ")
);
console.log(process("  Hello   World  ")); // "hello world"
```

---

## Token Counting

```ts
import { countTokens, getContextWindowSize } from "gauss-ts";

const tokens = countTokens("Hello, how are you?");
console.log(tokens); // ~6

const windowSize = getContextWindowSize("gpt-4o");
console.log(windowSize); // 128000
```
