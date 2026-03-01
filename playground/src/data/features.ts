export interface Feature {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'core' | 'orchestration' | 'protocol' | 'infra';
  code: string;
}

export const FEATURES: Feature[] = [
  {
    id: 'agent',
    name: 'Agents',
    icon: '🤖',
    category: 'core',
    description: 'Create LLM-powered agents with tools, memory, structured output, and streaming.',
    code: `import { Agent } from 'gauss-ts';

const agent = new Agent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: 'You are a helpful assistant.',
  tools: [searchTool, calculatorTool],
});

const result = await agent.run('What is 42 * 17?');
console.log(result.content);`,
  },
  {
    id: 'team',
    name: 'Teams',
    icon: '👥',
    category: 'orchestration',
    description: 'Coordinate multiple agents in parallel or sequential team workflows with shared context.',
    code: `import { Agent, Team } from 'gauss-ts';

const researcher = new Agent({ name: 'researcher', model: 'gpt-4o' });
const writer = new Agent({ name: 'writer', model: 'gpt-4o' });

const team = new Team({
  name: 'content-team',
  agents: [researcher, writer],
  strategy: 'sequential',
});

const result = await team.run('Write about quantum computing');`,
  },
  {
    id: 'graph',
    name: 'Graphs',
    icon: '🔀',
    category: 'orchestration',
    description: 'Build DAG-based execution pipelines with conditional branching and parallel nodes.',
    code: `import { Graph } from 'gauss-ts';

const graph = new Graph('pipeline');

graph.addNode('classify', classifyAgent);
graph.addNode('respond', respondAgent);
graph.addNode('escalate', escalateAgent);

graph.addEdge('classify', 'respond', (ctx) => ctx.label === 'simple');
graph.addEdge('classify', 'escalate', (ctx) => ctx.label === 'complex');

const result = await graph.run({ input: 'Help me reset my password' });`,
  },
  {
    id: 'workflow',
    name: 'Workflows',
    icon: '⚙️',
    category: 'orchestration',
    description: 'Define stateful, step-based workflows with retries, checkpoints, and approval gates.',
    code: `import { Workflow } from 'gauss-ts';

const workflow = new Workflow('onboarding');

workflow.step('validate', async (ctx) => {
  return await validateUser(ctx.input);
});

workflow.step('provision', async (ctx) => {
  return await createAccount(ctx.prev);
});

workflow.step('notify', async (ctx) => {
  return await sendWelcomeEmail(ctx.prev);
});

const result = await workflow.run({ email: 'user@example.com' });`,
  },
  {
    id: 'network',
    name: 'Networks',
    icon: '🌐',
    category: 'orchestration',
    description: 'Multi-agent networks with dynamic routing, message passing, and shared state.',
    code: `import { Network } from 'gauss-ts';

const network = new Network({
  name: 'support-network',
  agents: [triageAgent, billingAgent, techAgent],
  router: async (message) => {
    const category = await classify(message);
    return category; // routes to matching agent
  },
});

const result = await network.run('My invoice is incorrect');`,
  },
  {
    id: 'mcp',
    name: 'MCP',
    icon: '🔌',
    category: 'protocol',
    description: 'Model Context Protocol — expose agents as MCP servers or consume external MCP tools.',
    code: `import { MCPServer } from 'gauss-ts';

const server = new MCPServer({
  name: 'gauss-tools',
  version: '1.0.0',
});

server.tool('search', {
  description: 'Search the knowledge base',
  parameters: { query: { type: 'string' } },
  handler: async ({ query }) => {
    return await knowledgeBase.search(query);
  },
});

await server.listen({ transport: 'stdio' });`,
  },
  {
    id: 'a2a',
    name: 'A2A',
    icon: '🔗',
    category: 'protocol',
    description: 'Agent-to-Agent protocol for cross-system agent communication and task delegation.',
    code: `import { A2AServer, A2AClient } from 'gauss-ts';

// Expose an agent as an A2A service
const server = new A2AServer({
  agent: myAgent,
  port: 3001,
});
await server.start();

// Connect to a remote A2A agent
const client = new A2AClient('http://remote:3001');
const result = await client.sendTask({
  message: 'Translate this to French',
});`,
  },
  {
    id: 'tool-registry',
    name: 'Tool Registry',
    icon: '🧰',
    category: 'core',
    description: 'Centralized tool management with validation, versioning, and dynamic discovery.',
    code: `import { ToolRegistry } from 'gauss-ts';

const registry = new ToolRegistry();

registry.register({
  name: 'weather',
  description: 'Get current weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string' },
    },
    required: ['city'],
  },
  handler: async ({ city }) => {
    return await fetchWeather(city);
  },
});

const agent = new Agent({ tools: registry.all() });`,
  },
  {
    id: 'structured',
    name: 'Structured Output',
    icon: '📋',
    category: 'core',
    description: 'Type-safe structured output with Zod schemas and automatic validation.',
    code: `import { Agent } from 'gauss-ts';
import { z } from 'zod';

const schema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
});

const result = await agent.run('Analyze: Great product!', {
  output: schema,
});
// result.content is typed as { sentiment, confidence, summary }`,
  },
  {
    id: 'streaming',
    name: 'Streaming',
    icon: '🌊',
    category: 'core',
    description: 'Real-time token streaming with SSE, tool call events, and progress tracking.',
    code: `import { Agent } from 'gauss-ts';

const stream = agent.stream('Explain relativity');

for await (const event of stream) {
  switch (event.type) {
    case 'text':
      process.stdout.write(event.content);
      break;
    case 'tool_call':
      console.log(\`Calling: \${event.name}\`);
      break;
    case 'done':
      console.log(\`\\nTokens: \${event.tokenCount}\`);
      break;
  }
}`,
  },
  {
    id: 'memory',
    name: 'Memory',
    icon: '🧠',
    category: 'infra',
    description: 'Pluggable memory backends — in-memory, Redis, vector stores — with automatic context management.',
    code: `import { Agent, VectorMemory } from 'gauss-ts';

const memory = new VectorMemory({
  store: 'qdrant',
  collection: 'agent-memory',
  embedModel: 'text-embedding-3-small',
});

const agent = new Agent({
  name: 'assistant',
  memory,
  memoryStrategy: 'semantic', // auto-retrieve relevant context
});`,
  },
  {
    id: 'guardrail',
    name: 'Guardrails',
    icon: '🛡️',
    category: 'infra',
    description: 'Input/output guardrails for content safety, PII detection, and policy enforcement.',
    code: `import { Agent, Guardrail } from 'gauss-ts';

const piiGuard = new Guardrail({
  name: 'pii-filter',
  position: 'output',
  check: async (content) => {
    const hasPII = detectPII(content);
    return { pass: !hasPII, reason: 'Contains PII' };
  },
});

const agent = new Agent({
  guardrails: [piiGuard],
});`,
  },
  {
    id: 'middleware',
    name: 'Middleware',
    icon: '🔧',
    category: 'infra',
    description: 'Composable middleware pipeline for logging, caching, rate limiting, and custom transforms.',
    code: `import { Agent, middleware } from 'gauss-ts';

const agent = new Agent({
  name: 'assistant',
  middleware: [
    middleware.logging({ level: 'debug' }),
    middleware.cache({ ttl: 3600 }),
    middleware.rateLimit({ maxPerMinute: 60 }),
    middleware.retry({ maxAttempts: 3 }),
  ],
});`,
  },
  {
    id: 'telemetry',
    name: 'Telemetry',
    icon: '📊',
    category: 'infra',
    description: 'OpenTelemetry integration for distributed tracing, metrics, and observability.',
    code: `import { Agent, Telemetry } from 'gauss-ts';

Telemetry.init({
  serviceName: 'my-ai-app',
  exporter: 'otlp',
  endpoint: 'http://localhost:4317',
});

// All agent calls are automatically traced
const agent = new Agent({ name: 'traced-agent' });
const result = await agent.run('Hello');
// Spans: agent.run → llm.call → tool.execute`,
  },
  {
    id: 'eval',
    name: 'Evaluations',
    icon: '🧪',
    category: 'infra',
    description: 'Built-in evaluation framework for testing agent quality, accuracy, and performance.',
    code: `import { Eval } from 'gauss-ts';

const suite = new Eval({
  agent: myAgent,
  dataset: [
    { input: 'What is 2+2?', expected: '4' },
    { input: 'Capital of France?', expected: 'Paris' },
  ],
  metrics: ['accuracy', 'latency', 'cost'],
});

const results = await suite.run();
console.log(results.accuracy); // 1.0`,
  },
  {
    id: 'resilience',
    name: 'Resilience',
    icon: '🔄',
    category: 'infra',
    description: 'Circuit breakers, retries with backoff, fallback chains, and timeout management.',
    code: `import { Agent, resilience } from 'gauss-ts';

const agent = new Agent({
  name: 'resilient-agent',
  resilience: resilience.compose(
    resilience.timeout(30_000),
    resilience.retry({ maxAttempts: 3, backoff: 'exponential' }),
    resilience.circuitBreaker({ threshold: 5, resetMs: 60_000 }),
    resilience.fallback(fallbackAgent),
  ),
});`,
  },
];

export const FEATURE_CATEGORIES = {
  core: { label: 'Core', color: '#58a6ff' },
  orchestration: { label: 'Orchestration', color: '#bc8cff' },
  protocol: { label: 'Protocols', color: '#3fb950' },
  infra: { label: 'Infrastructure', color: '#d29922' },
} as const;

export const QUICK_START_SNIPPETS = [
  {
    id: 'basic-agent',
    title: 'Basic Agent',
    code: `import { Agent } from 'gauss-ts';

const agent = new Agent({
  name: 'assistant',
  model: 'gpt-4o',
  instructions: 'You are a helpful assistant.',
});

const result = await agent.run('Hello, world!');
console.log(result.content);`,
  },
  {
    id: 'team-coord',
    title: 'Team Coordination',
    code: `import { Agent, Team } from 'gauss-ts';

const researcher = new Agent({ name: 'researcher', model: 'gpt-4o' });
const writer = new Agent({ name: 'writer', model: 'gpt-4o' });

const team = new Team({
  name: 'content-team',
  agents: [researcher, writer],
  strategy: 'sequential',
});

const result = await team.run('Write about AI agents');`,
  },
  {
    id: 'mcp-server',
    title: 'MCP Server',
    code: `import { MCPServer } from 'gauss-ts';

const server = new MCPServer({
  name: 'my-tools',
  version: '1.0.0',
});

server.tool('greet', {
  description: 'Greet a user',
  parameters: { name: { type: 'string' } },
  handler: async ({ name }) => \`Hello, \${name}!\`,
});

await server.listen({ transport: 'stdio' });`,
  },
  {
    id: 'tool-reg',
    title: 'Tool Registry',
    code: `import { ToolRegistry, Agent } from 'gauss-ts';

const registry = new ToolRegistry();

registry.register({
  name: 'weather',
  description: 'Get weather for a city',
  parameters: { city: { type: 'string' } },
  handler: async ({ city }) => fetchWeather(city),
});

const agent = new Agent({ tools: registry.all() });`,
  },
  {
    id: 'graph-pipeline',
    title: 'Graph Pipeline',
    code: `import { Graph } from 'gauss-ts';

const graph = new Graph('classify-and-respond');

graph.addNode('classify', classifyAgent);
graph.addNode('simple', simpleAgent);
graph.addNode('complex', complexAgent);

graph.addEdge('classify', 'simple', (ctx) => !ctx.isComplex);
graph.addEdge('classify', 'complex', (ctx) => ctx.isComplex);

const result = await graph.run({ input: 'Hello' });`,
  },
];
