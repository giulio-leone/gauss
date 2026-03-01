# Gauss Examples

Production-ready examples covering all major features of the Gauss native SDK.

## Quick Start

```bash
# Install dependencies
npm install gauss-ai

# Set your API key
export OPENAI_API_KEY=sk-...

# Run any example
npx tsx examples/17-zero-config.ts
```

## Examples

| # | File | Feature |
|---|------|---------|
| 01 | [basic-agent.ts](01-basic-agent.ts) | Agent, `gauss()` shorthand, `batch()` parallel |
| 02 | [planning-agent.ts](02-planning-agent.ts) | Agent with tools + JS-side tool executor |
| 03 | [subagent-orchestration.ts](03-subagent-orchestration.ts) | Team-based multi-agent orchestration |
| 04 | [mcp-integration.ts](04-mcp-integration.ts) | MCP server with tools, resources, prompts |
| 05 | [persistent-memory.ts](05-persistent-memory.ts) | Memory + VectorStore for RAG context |
| 06 | [full-featured.ts](06-full-featured.ts) | Agent + Memory + Middleware + Guardrails + Telemetry |
| 07 | [plugin-system.ts](07-plugin-system.ts) | PluginRegistry with event-driven plugins |
| 08 | [a2a-server.ts](08-a2a-server.ts) | A2A (Agent-to-Agent) protocol client |
| 09 | [cli-and-rest.ts](09-cli-and-rest.ts) | Interactive CLI interface for an agent |
| 10 | [team-coordination.ts](10-team-coordination.ts) | Team with sequential + parallel strategies |
| 11 | [voice-pipeline.ts](11-voice-pipeline.ts) | Voice STT/TTS pipeline (placeholder) |
| 12 | [workflow-dsl.ts](12-workflow-dsl.ts) | Workflow with dependency-based steps |
| 13 | [multimodal-vision.ts](13-multimodal-vision.ts) | Agent with image input (vision) |
| 14 | [video-processing.ts](14-video-processing.ts) | Video analysis (placeholder) |
| 15 | [universal-provider.ts](15-universal-provider.ts) | All providers: OpenAI, Anthropic, Google, Groq, DeepSeek, Ollama |
| 16 | [llm-recording.ts](16-llm-recording.ts) | Telemetry + EvalRunner for recording/eval |
| 17 | [zero-config.ts](17-zero-config.ts) | `gauss()` one-liner, zero config |
| 18 | [tool-registry.ts](18-tool-registry.ts) | ToolRegistry with search, tags, examples |
| 19 | [graph-pipeline.ts](19-graph-pipeline.ts) | Graph DAG with fork/join nodes |
| 20 | [network-delegation.ts](20-network-delegation.ts) | Network with supervisor routing |
| 21 | [structured-output.ts](21-structured-output.ts) | `structured()` with JSON schema validation |
| 22 | [dx-utilities.ts](22-dx-utilities.ts) | `template()`, `pipe()`, `mapAsync()`, `compose()`, `withRetry()` |

## Requirements

- Node.js 18+
- TypeScript 5+
- API key for your chosen provider (OpenAI, Anthropic, Google, Groq, DeepSeek)
- `gauss-ai` npm package (native Rust bindings via NAPI)
