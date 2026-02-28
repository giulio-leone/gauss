# Gauss Examples

Production-ready examples covering all major features.

## Quick Start

```bash
# Install dependencies
npm install @giulio-leone/gauss

# Set your API key
export OPENAI_API_KEY=sk-...

# Run any example
npx tsx examples/17-zero-config.ts
```

## Examples

| # | File | Feature |
|---|------|---------|
| 01 | [basic-agent.ts](01-basic-agent.ts) | Agent with tools and structured output |
| 02 | [planning-agent.ts](02-planning-agent.ts) | Multi-step task decomposition |
| 03 | [subagent-orchestration.ts](03-subagent-orchestration.ts) | Parent-child agent delegation |
| 04 | [mcp-integration.ts](04-mcp-integration.ts) | Model Context Protocol client |
| 05 | [persistent-memory.ts](05-persistent-memory.ts) | Conversation memory with PostgreSQL |
| 06 | [full-featured.ts](06-full-featured.ts) | All features combined |
| 07 | [plugin-system.ts](07-plugin-system.ts) | Guardrails, evals, observability |
| 08 | [a2a-server.ts](08-a2a-server.ts) | Agent-to-Agent protocol server |
| 09 | [cli-and-rest.ts](09-cli-and-rest.ts) | CLI and REST API |
| 10 | [team-coordination.ts](10-team-coordination.ts) | Multi-agent teams with strategies |
| 11 | [voice-pipeline.ts](11-voice-pipeline.ts) | Voice STT/TTS pipeline |
| 12 | [workflow-dsl.ts](12-workflow-dsl.ts) | Fluent workflow DSL |
| 13 | [multimodal-vision.ts](13-multimodal-vision.ts) | Image analysis and OCR |
| 14 | [video-processing.ts](14-video-processing.ts) | Video frame extraction and analysis |
| 15 | [universal-provider.ts](15-universal-provider.ts) | Dynamic AI provider switching |
| 16 | [llm-recording.ts](16-llm-recording.ts) | LLM call recording and replay |
| 17 | [zero-config.ts](17-zero-config.ts) | Zero-config one-liner |

## Requirements

- Node.js 18+
- TypeScript 5+
- API key for your chosen provider (OpenAI, Anthropic, Google, etc.)
