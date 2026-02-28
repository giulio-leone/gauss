---
sidebar_position: 9
title: Error Handling
description: Complete reference for Gauss's hierarchical error system
---

# Error Handling

Gauss provides a comprehensive, hierarchical error system with structured error classes, error codes, and event-based error handling. This allows for precise error identification, handling, and debugging.

## Error Hierarchy

All Gauss errors extend the base `GaussError` class, which provides structured error information including error codes and root cause tracking.

### Base Error Class

```typescript
import { GaussError } from "gauss";

class GaussError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GaussError";
  }
}
```

All errors include:
- **message**: Human-readable error description
- **code**: Machine-readable error identifier
- **cause**: Optional underlying error or cause
- **name**: Error class name for type checking

### Error Classes

```typescript
import {
  GaussError,          // Base error class
  ToolExecutionError,      // Tool execution failures
  PluginError,            // Plugin lifecycle errors  
  McpConnectionError,     // MCP server connection issues
  RuntimeError,           // Runtime/platform errors
  StreamingError,         // Streaming/SSE errors
  ConfigurationError,     // Invalid configuration
  CircuitBreakerError,    // Circuit breaker failures
  RateLimiterError,       // Rate limiting errors
} from "gauss";
```

### Error Codes Reference

| Error Class | Code | Description | Common Causes |
|-------------|------|-------------|---------------|
| `ToolExecutionError` | `TOOL_EXECUTION_ERROR` | Tool failed to execute | Invalid parameters, external API failures, file system errors |
| `PluginError` | `PLUGIN_ERROR` | Plugin hook failure | Plugin initialization, hook execution errors |
| `McpConnectionError` | `MCP_CONNECTION_ERROR` | MCP server unreachable | Network issues, server down, authentication failures |
| `RuntimeError` | `RUNTIME_ERROR` | Platform/runtime issue | Environment-specific failures, missing dependencies |
| `StreamingError` | `STREAMING_ERROR` | SSE/streaming failure | Connection drops, malformed streams, client disconnection |
| `ConfigurationError` | `CONFIGURATION_ERROR` | Invalid config provided | Missing required fields, invalid types, conflicting options |
| `CircuitBreakerError` | `CIRCUIT_BREAKER_ERROR` | Circuit breaker is open | Service failures exceeded threshold |
| `RateLimiterError` | `RATE_LIMITER_ERROR` | Rate limit exceeded | Too many requests, token bucket empty |

## Error Handling Patterns

### Try-Catch with Type Guards

```typescript
import { 
  Agent, 
  ToolExecutionError, 
  McpConnectionError,
  ConfigurationError 
} from "gauss";
import { openai } from "@ai-sdk/openai";

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a helpful assistant.",
});

try {
  const result = await agent.run("Process this data");
  console.log("Success:", result.text);
} catch (error) {
  if (error instanceof ToolExecutionError) {
    console.error("Tool failed:", error.code, error.message);
    console.error("Caused by:", error.cause);
  } else if (error instanceof McpConnectionError) {
    console.error("MCP connection failed:", error.message);
  } else if (error instanceof ConfigurationError) {
    console.error("Configuration error:", error.message);
  } else if (error instanceof GaussError) {
    console.error("Gauss error:", error.code, error.message);
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Event-Based Error Handling

Gauss's event system provides centralized error handling:

```typescript
import { Agent, GaussError } from "gauss";

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a resilient assistant.",
})
  .on("error", (event) => {
    const error = event.data;
    
    console.error(`[${event.timestamp}] Error in ${event.source}:`, error);
    
    // Handle specific error types
    if (error instanceof ToolExecutionError) {
      handleToolError(error);
    } else if (error instanceof McpConnectionError) {
      handleMcpError(error);
    }
  })
  .on("tool:error", (event) => {
    console.error("Tool-specific error:", event.data.toolName, event.data.error);
  })
  .build();

function handleToolError(error: ToolExecutionError) {
  console.log("Attempting tool error recovery...");
  // Implement retry logic, fallback tools, etc.
}

function handleMcpError(error: McpConnectionError) {
  console.log("MCP connection lost, attempting reconnection...");
  // Implement reconnection logic
}
```

### Async Error Handling with Event Listeners

```typescript
const agent = Agent.create({ model, instructions: "..." })
  .on("*", (event) => {
    // Listen to all events for comprehensive error monitoring
    if (event.type === "error") {
      logError(event.data, event.source);
    }
  })
  .build();

async function logError(error: Error, source: string) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    source,
    type: error.constructor.name,
    code: error instanceof GaussError ? error.code : "UNKNOWN",
    message: error.message,
    cause: error instanceof GaussError ? error.cause : null,
    stack: error.stack,
  };
  
  // Send to logging service, write to file, etc.
  console.error("Error logged:", errorLog);
}
```

## Error Recovery Strategies

### Retry with Exponential Backoff

```typescript
import { Agent, ToolExecutionError } from "gauss";

async function runWithRetry(agent: Agent, prompt: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await agent.run(prompt);
    } catch (error) {
      if (error instanceof ToolExecutionError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Final attempt or non-recoverable error
      }
    }
  }
}

// Usage
try {
  const result = await runWithRetry(agent, "Complex task that might fail");
  console.log("Success after retry:", result.text);
} catch (error) {
  console.error("All retry attempts failed:", error);
}
```

### Graceful Degradation

```typescript
import { 
  Agent, 
  McpConnectionError, 
  ToolExecutionError 
} from "gauss";

async function runWithFallback(agent: Agent, prompt: string) {
  try {
    // Attempt with full functionality
    return await agent.run(prompt);
  } catch (error) {
    if (error instanceof McpConnectionError) {
      console.warn("MCP unavailable, using local tools only");
      
      // Create agent without MCP tools
      const fallbackAgent = Agent.create({
        model: agent.config.model,
        instructions: agent.config.instructions + " (Note: External tools unavailable)"
      }).withPlanning().build();
      
      return await fallbackAgent.run(prompt);
    } else if (error instanceof ToolExecutionError) {
      console.warn("Tool execution failed, using simplified approach");
      
      // Modify prompt to avoid problematic operations
      const simplifiedPrompt = `${prompt} (Please use only basic operations)`;
      return await agent.run(simplifiedPrompt);
    } else {
      throw error; // Non-recoverable error
    }
  }
}
```

### Circuit Breaker Integration

Combine error handling with resilience patterns:

```typescript
import { 
  Agent, 
  CircuitBreaker, 
  CircuitBreakerError,
  ToolExecutionError 
} from "gauss";

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 30000,
  monitorWindowMs: 60000,
});

const agent = Agent.create({ model, instructions: "..." })
  .withCircuitBreaker(circuitBreaker)
  .on("error", (event) => {
    const error = event.data;
    
    if (error instanceof CircuitBreakerError) {
      console.log("Circuit breaker is open, service temporarily unavailable");
      // Implement fallback behavior or queue request for later
    } else if (error instanceof ToolExecutionError) {
      console.log("Tool error recorded by circuit breaker");
    }
  })
  .build();

async function resilientRun(prompt: string) {
  try {
    return await agent.run(prompt);
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      // Circuit is open, try again later
      console.log("Service unavailable, scheduling retry...");
      setTimeout(() => resilientRun(prompt), 30000);
      throw new Error("Service temporarily unavailable, retry scheduled");
    }
    throw error;
  }
}
```

## Plugin Error Handling

Plugins can implement error handling in their hooks:

```typescript
import { Plugin, PluginError } from "gauss";

const errorHandlingPlugin: Plugin = {
  name: "error-handler",
  hooks: {
    onError: async (ctx, { error, step, tool }) => {
      console.error("Plugin error handler:", error);
      
      if (error instanceof ToolExecutionError && tool?.name === "critical_tool") {
        // Attempt recovery for critical tool failures
        try {
          await recoverFromCriticalToolFailure(tool, error);
          return { recovered: true };
        } catch (recoveryError) {
          throw new PluginError("Failed to recover from critical tool error", recoveryError);
        }
      }
      
      // Return undefined to continue normal error handling
      return undefined;
    },
    
    afterTool: async (ctx, params) => {
      // Validate tool results and throw early if invalid
      if (params.tool.name === "data_processor" && !isValidData(params.result)) {
        throw new ToolExecutionError("Tool returned invalid data format");
      }
    },
  },
};

async function recoverFromCriticalToolFailure(tool: any, error: ToolExecutionError) {
  // Implement recovery logic
  console.log("Attempting recovery for tool:", tool.name);
  // ...recovery implementation
}

function isValidData(data: any): boolean {
  // Implement data validation
  return data && typeof data === 'object' && data.isValid === true;
}
```

## Error Aggregation and Reporting

For production applications, implement comprehensive error tracking:

```typescript
import { Agent, GaussError } from "gauss";

interface ErrorReport {
  id: string;
  timestamp: string;
  errorType: string;
  errorCode?: string;
  message: string;
  source: string;
  sessionId?: string;
  userId?: string;
  context?: Record<string, unknown>;
}

class ErrorTracker {
  private errors: ErrorReport[] = [];
  
  trackError(error: Error, source: string, context?: Record<string, unknown>) {
    const report: ErrorReport = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      errorType: error.constructor.name,
      errorCode: error instanceof GaussError ? error.code : undefined,
      message: error.message,
      source,
      context,
    };
    
    this.errors.push(report);
    
    // Send to external error tracking service
    this.reportToService(report);
    
    // Log locally
    console.error("Error tracked:", report);
  }
  
  private async reportToService(report: ErrorReport) {
    try {
      // Example: Send to error tracking service
      await fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
    } catch (err) {
      console.error("Failed to report error to service:", err);
    }
  }
  
  getErrorStats() {
    return {
      total: this.errors.length,
      byType: this.errors.reduce((acc, err) => {
        acc[err.errorType] = (acc[err.errorType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recent: this.errors.slice(-10),
    };
  }
}

const errorTracker = new ErrorTracker();

const agent = Agent.create({ model, instructions: "..." })
  .on("error", (event) => {
    errorTracker.trackError(event.data, event.source, {
      sessionId: agent.config.id,
      step: event.metadata?.step,
      tool: event.metadata?.tool,
    });
  })
  .build();
```

## Testing Error Scenarios

Test error handling with mock failures:

```typescript
import { 
  Agent, 
  ToolExecutionError, 
  McpConnectionError 
} from "gauss";

// Mock filesystem that fails on specific paths
class FailingFilesystem {
  async read(path: string): Promise<string> {
    if (path.includes("fail")) {
      throw new ToolExecutionError(`Failed to read ${path}`, new Error("Simulated failure"));
    }
    return "file content";
  }
  
  async write(path: string, content: string): Promise<void> {
    if (path.includes("readonly")) {
      throw new ToolExecutionError(`Cannot write to ${path}`, new Error("Read-only file"));
    }
  }
}

// Test error handling
describe("Agent Error Handling", () => {
  test("handles tool execution errors gracefully", async () => {
    const agent = Agent.create({ model, instructions: "..." })
      .withFilesystem(new FailingFilesystem())
      .build();
    
    const errors: Error[] = [];
    agent.on("error", (event) => errors.push(event.data));
    
    try {
      await agent.run("Read the file at /path/to/fail.txt");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(ToolExecutionError);
    }
  });
});
```

## Best Practices

### Error Handling Guidelines

1. **Use specific error types**: Catch specific error classes rather than generic `Error`
2. **Preserve error context**: Always include the original error as `cause` when wrapping
3. **Log structured data**: Include relevant context (session ID, tool name, parameters)
4. **Implement graceful degradation**: Provide fallback functionality when possible
5. **Monitor error patterns**: Track error frequencies to identify systemic issues

### Error Recovery Strategies

1. **Immediate retry**: For transient network or resource issues
2. **Exponential backoff**: For rate-limited or overloaded services
3. **Circuit breaking**: For services with extended outages
4. **Graceful degradation**: Fall back to limited functionality
5. **Human escalation**: Route complex errors to human operators

### Production Monitoring

1. **Error rate monitoring**: Track errors per minute/hour
2. **Error type distribution**: Monitor which error types are most common
3. **Recovery success rates**: Track how often recovery strategies succeed
4. **User impact assessment**: Measure how errors affect user experience

```typescript
// Example production error monitoring setup
const agent = Agent.create({ model, instructions: "..." })
  .on("error", (event) => {
    // Increment error counter metric
    metrics.increment("agent.errors", {
      type: event.data.constructor.name,
      code: event.data instanceof GaussError ? event.data.code : "unknown",
    });
    
    // Log to structured logging system
    logger.error("Agent error occurred", {
      error: event.data,
      source: event.source,
      sessionId: agent.config.id,
      timestamp: event.timestamp,
    });
    
    // Alert on critical errors
    if (event.data instanceof McpConnectionError) {
      alerts.send("MCP connection failure detected");
    }
  })
  .build();
```