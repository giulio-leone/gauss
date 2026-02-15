---
sidebar_position: 2
title: Architecture
description: Hexagonal architecture with ports, adapters, and plugins
---

# Hexagonal Architecture

GaussFlow follows **hexagonal architecture** (also known as ports & adapters). The core domain (`DeepAgent`) depends only on port interfaces — never on concrete implementations. Adapters implement those interfaces for specific platforms and services.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DeepAgent (Orchestrator)                         │
│                                                                      │
│  EventBus ─ ApprovalMgr ─ TokenTracker ─ ContextMgr ─ PluginMgr    │
└──────┬──────────────┬──────────────┬──────────────┬─────────────────┘
       │              │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
  │  Ports  │   │   Ports   │  │  Ports  │  │   Ports   │
  │(inbound)│   │ (outbound)│  │(observe)│  │ (infra)   │
  ├─────────┤   ├───────────┤  ├─────────┤  ├───────────┤
  │PluginPort│  │Filesystem │  │Tracing  │  │RuntimePort│
  │ModelPort │  │MemoryPort │  │Metrics  │  │Validation │
  │Consensus │  │McpPort    │  │Logging  │  │TokenCount │
  │          │  │LearningPt │  │         │  │           │
  └────┬────┘  └─────┬─────┘  └────┬────┘  └─────┬─────┘
       │              │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐  ┌─────▼─────┐
  │Adapters │   │ Adapters  │  │Adapters │  │ Adapters  │
  ├─────────┤   ├───────────┤  ├─────────┤  ├───────────┤
  │BasePlugin│  │VirtualFS  │  │InMemory │  │NodeRuntime│
  │Guardrails│  │LocalFS    │  │ Tracing │  │DenoRuntime│
  │Workflow  │  │InMemoryMem│  │InMemory │  │BunRuntime │
  │Observ.   │  │Supabase   │  │ Metrics │  │EdgeRuntime│
  │OneCrawl  │  │AiSdkMcp   │  │Console  │  │ZodValid. │
  │Vectorless│  │OnegenUiMcp│  │ Logging │  │Approximate│
  │Evals     │  │InMemLearn │  │         │  │Tiktoken   │
  └─────────┘  └───────────┘  └─────────┘  └───────────┘
```

## Ports

Ports are TypeScript interfaces that define contracts. They live in `src/ports/`:

| Port | Purpose |
|------|---------|
| `FilesystemPort` | File operations with zone-based isolation |
| `MemoryPort` | Persistent state (todos, checkpoints, conversations) |
| `McpPort` | MCP server discovery and tool execution |
| `ModelPort` | LLM invocation abstraction |
| `PluginPort` | Plugin lifecycle hooks and tool injection |
| `RuntimePort` | Platform-agnostic runtime APIs (UUID, env, fetch) |
| `TokenCounterPort` | Token counting, budgeting, cost estimation |
| `LearningPort` | Cross-session user profiles and memories |
| `ValidationPort` | Engine-agnostic data validation |
| `TracingPort` | Distributed tracing with spans |
| `MetricsPort` | Counters, histograms, gauges |
| `LoggingPort` | Structured logging |
| `ConsensusPort` | Fork result evaluation strategy |

## Adapters

Adapters are concrete implementations. The framework ships with defaults for every port:

| Port | Default Adapter | Alternatives |
|------|----------------|-------------|
| `FilesystemPort` | `VirtualFilesystem` | `LocalFilesystem` (Node.js), `DenoFilesystem`, `OpfsFilesystem` |
| `MemoryPort` | `InMemoryAdapter` | `SupabaseMemoryAdapter`, `DenoKvMemoryAdapter`, `IndexedDbMemoryAdapter` |
| `RuntimePort` | Auto-detected | `NodeRuntimeAdapter`, `DenoRuntimeAdapter`, `BunRuntimeAdapter`, `EdgeRuntimeAdapter` |
| `TokenCounterPort` | `ApproximateTokenCounter` | `TiktokenTokenCounter` |
| `ValidationPort` | `ZodValidationAdapter` | Custom implementations |
| `TracingPort` | `InMemoryTracingAdapter` | Custom (e.g., OpenTelemetry) |
| `MetricsPort` | `InMemoryMetricsAdapter` | Custom (e.g., Prometheus) |
| `LoggingPort` | `ConsoleLoggingAdapter` | Custom (e.g., Pino, Winston) |
| `ConsensusPort` | — | `LlmJudgeConsensus`, `MajorityVoteConsensus`, `DebateConsensus` |

## Plugins

Plugins extend agent behavior through **lifecycle hooks** and **tool injection**. They follow a deterministic execution order based on registration:

```typescript
import { DeepAgent, createGuardrailsPlugin, createEvalsPlugin } from "@giulio-leone/gaussflow-agent";

const agent = DeepAgent.create({ model, instructions: "..." })
  .use(createGuardrailsPlugin({ /* ... */ }))  // Runs first
  .use(createEvalsPlugin())                     // Runs second
  .build();
```

### Plugin Lifecycle Hooks

| Hook | When |
|------|------|
| `beforeRun` | Before the agent loop starts — can modify the prompt |
| `afterRun` | After the agent loop completes |
| `beforeTool` | Before a tool is executed — can modify args or skip |
| `afterTool` | After a tool returns |
| `beforeStep` | Before each step in the loop |
| `afterStep` | After each step |
| `onError` | When an error occurs — can suppress it |

## AbstractBuilder

The `AbstractBuilder<T>` provides a template method pattern used by `DeepAgentBuilder` and `AgentGraphBuilder`:

```typescript
import { AbstractBuilder } from "@giulio-leone/gaussflow-agent";

abstract class AbstractBuilder<T> {
  protected abstract validate(): void;
  protected abstract construct(): T;

  build(): T {
    this.validate();    // Throws if invalid
    return this.construct();
  }
}
```

This ensures all builders validate their configuration before constructing the target object.

## BasePlugin

The `BasePlugin` abstract class provides the skeleton for plugin development:

```typescript
import { BasePlugin } from "@giulio-leone/gaussflow-agent";
import type { PluginHooks } from "@giulio-leone/gaussflow-agent";

class MyPlugin extends BasePlugin {
  readonly name = "my-plugin";

  protected buildHooks(): PluginHooks {
    return {
      beforeRun: async (ctx, params) => {
        // Your logic here
      },
    };
  }
}
```

`BasePlugin` handles `name`, `version` (defaults to `"1.0.0"`), and hook registration.
