---
sidebar_position: 3
title: ObservabilityPlugin
description: Three-pillar observability — tracing, metrics, and logging
---

# ObservabilityPlugin

The `ObservabilityPlugin` provides three-pillar observability by integrating `TracingPort`, `MetricsPort`, and `LoggingPort`. All three are optional — use any combination.

## Quick Start

```typescript
import {
  DeepAgent,
  createObservabilityPlugin,
  InMemoryTracingAdapter,
  InMemoryMetricsAdapter,
  ConsoleLoggingAdapter,
} from "@giulio-leone/gaussflow-agent";

const tracer = new InMemoryTracingAdapter();
const metrics = new InMemoryMetricsAdapter();
const logger = new ConsoleLoggingAdapter();

const agent = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant.",
})
  .use(createObservabilityPlugin({ tracer, metrics, logger }))
  .build();

await agent.run("Hello!");
```

## Configuration

```typescript
interface ObservabilityPluginConfig {
  tracer?: TracingPort;     // Distributed tracing
  metrics?: MetricsPort;    // Counters, histograms, gauges
  logger?: LoggingPort;     // Structured logging
}
```

All fields are optional. The plugin gracefully skips any pillar that isn't configured.

## What Gets Instrumented

### Tracing

| Span | Created | Attributes |
|------|---------|------------|
| `agent.run` | `beforeRun` | `session.id` |
| `tool.<name>` | `beforeTool` | `tool.call.id`, `duration.ms` |

Spans are hierarchical — tool spans are children of the `agent.run` span. On error, all active spans are ended with status `"error"`.

### Metrics

| Metric | Type | When |
|--------|------|------|
| `agent.runs.total` | Counter | Each agent run starts |
| `agent.runs.success` | Counter | Agent run completes successfully |
| `agent.runs.errors` | Counter | Agent run errors |
| `agent.tools.total` | Counter | Each tool call (labeled by tool name) |
| `agent.tool.duration.ms` | Histogram | Each tool call completes |

### Logging

| Level | Message | Context |
|-------|---------|---------|
| `info` | "Agent run started" | `{ sessionId }` |
| `info` | "Agent run completed" | `{ sessionId }` |
| `debug` | "Tool call started" | `{ sessionId, tool }` |
| `debug` | "Tool call completed" | `{ tool, durationMs }` |
| `error` | "Agent error" | `{ sessionId, error }` |

## Observability Ports

### TracingPort

```typescript
interface TracingPort {
  startSpan(name: string, parentSpan?: Span): Span;
}

interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(status: "ok" | "error", message?: string): void;
  end(): void;
}
```

### MetricsPort

```typescript
interface MetricsPort {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number, labels?: Record<string, string>): void;
}
```

### LoggingPort

```typescript
type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggingPort {
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}
```

## Built-in Adapters

| Port | Adapter | Description |
|------|---------|-------------|
| `TracingPort` | `InMemoryTracingAdapter` | Stores spans in memory. Good for testing. |
| `MetricsPort` | `InMemoryMetricsAdapter` | Stores counters/histograms in memory. |
| `LoggingPort` | `ConsoleLoggingAdapter` | Logs to `console.*` with structured format. |

## Custom Adapters

Implement the port interfaces to integrate with your observability stack:

```typescript
import type { TracingPort, Span } from "@giulio-leone/gaussflow-agent";

class OpenTelemetryAdapter implements TracingPort {
  startSpan(name: string, parentSpan?: Span): Span {
    // Bridge to OpenTelemetry SDK
    const otelSpan = tracer.startSpan(name, { parent: parentSpan });
    return {
      traceId: otelSpan.spanContext().traceId,
      spanId: otelSpan.spanContext().spanId,
      name,
      setAttribute: (k, v) => otelSpan.setAttribute(k, v),
      setStatus: (s, msg) => otelSpan.setStatus({ code: s === "ok" ? 1 : 2, message: msg }),
      end: () => otelSpan.end(),
    };
  }
}
```

## Hooks Used

| Hook | Purpose |
|------|---------|
| `beforeRun` | Start root span, log run start, increment run counter |
| `afterRun` | End root span, log completion, increment success counter |
| `beforeTool` | Start child span, log tool start, increment tool counter |
| `afterTool` | End tool span with duration, log completion, record histogram |
| `onError` | End all spans with error status, log error, increment error counter |
