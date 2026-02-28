---
sidebar_position: 8
title: Resilience Patterns
description: Circuit breaker, rate limiter, and tool cache for robust agent operations
---

# Resilience Patterns

Gauss provides built-in resilience patterns to handle failures, rate limits, and performance optimization. These patterns help create robust, production-ready agents that can handle various failure modes gracefully.

## Circuit Breaker

The circuit breaker pattern prevents cascading failures by temporarily blocking operations that are likely to fail. It monitors failure rates and automatically "opens" when failures exceed a threshold.

### Configuration

```typescript
import { CircuitBreaker, DEFAULT_CIRCUIT_BREAKER_CONFIG } from "gauss";

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,        // Open after 5 consecutive failures
  resetTimeoutMs: 30_000,     // Wait 30 seconds before trying again
  monitorWindowMs: 60_000,    // Track failures over 1 minute window
});

// Default configuration
const defaultBreaker = new CircuitBreaker(DEFAULT_CIRCUIT_BREAKER_CONFIG);
```

### States

The circuit breaker has three states:

| State | Description | Behavior |
|-------|-------------|----------|
| **CLOSED** | Normal operation | All requests pass through |
| **OPEN** | Failing fast | All requests rejected immediately |
| **HALF_OPEN** | Testing recovery | Limited requests allowed to test service health |

### Usage with Agent

```typescript
import { Agent, CircuitBreaker } from "gauss";
import { openai } from "@ai-sdk/openai";

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 15_000,
  monitorWindowMs: 30_000,
});

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a resilient assistant that handles failures gracefully.",
})
  .withCircuitBreaker(circuitBreaker)
  .withPlanning()
  .build();

try {
  const result = await agent.run("Process this data safely.");
  console.log("Success:", result.text);
} catch (error) {
  if (error.message.includes("Circuit breaker is OPEN")) {
    console.log("Service temporarily unavailable, trying again later...");
  }
}
```

### Manual Circuit Breaker Usage

You can also use the circuit breaker directly for custom operations:

```typescript
const breaker = new CircuitBreaker({ failureThreshold: 3 });

async function makeApiCall() {
  return await breaker.execute(async () => {
    const response = await fetch("https://api.example.com/data");
    if (!response.ok) {
      throw new Error(`API failed with status ${response.status}`);
    }
    return response.json();
  });
}

// Check circuit breaker state
console.log("Circuit state:", breaker.getState());
console.log("Failure count:", breaker.getFailureCount());
```

## Rate Limiter

The rate limiter controls the frequency of operations using a token bucket algorithm. This helps prevent overwhelming external services and ensures fair resource usage.

### Configuration

```typescript
import { RateLimiter, DEFAULT_RATE_LIMITER_CONFIG } from "gauss";

const rateLimiter = new RateLimiter({
  maxTokens: 10,              // Maximum 10 tokens in bucket
  refillRateMs: 1000,         // Add 1 token every 1000ms (1 per second)
});

// Default configuration (10 tokens, 1 per second)
const defaultLimiter = new RateLimiter(DEFAULT_RATE_LIMITER_CONFIG);
```

### Usage with Agent

```typescript
import { Agent, RateLimiter } from "gauss";
import { openai } from "@ai-sdk/openai";

const rateLimiter = new RateLimiter({
  maxTokens: 5,               // 5 requests burst capacity
  refillRateMs: 2000,         // 1 token every 2 seconds
});

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a rate-limited assistant.",
})
  .withRateLimiter(rateLimiter)
  .withPlanning()
  .build();

// Tool executions are automatically rate-limited
const result = await agent.run("Make multiple API calls at controlled rate.");
```

### Manual Rate Limiter Usage

```typescript
const limiter = new RateLimiter({ maxTokens: 3, refillRateMs: 1000 });

async function rateLimitedOperation() {
  // Wait for token availability
  await limiter.acquire();
  
  // Perform the operation
  console.log("Operation executed at:", new Date().toISOString());
  return fetch("https://api.example.com/endpoint");
}

// Try immediate acquisition
if (limiter.tryAcquire()) {
  console.log("Token acquired immediately");
} else {
  console.log("No tokens available, would need to wait");
}
```

### Backpressure Handling

The rate limiter automatically handles backpressure by queuing requests when tokens are not available:

```typescript
const limiter = new RateLimiter({ maxTokens: 2, refillRateMs: 1000 });

// Multiple concurrent requests will be queued and processed at the configured rate
const promises = Array.from({ length: 5 }, (_, i) =>
  limiter.acquire().then(() => console.log(`Request ${i} processed`))
);

await Promise.all(promises);
// Output will show requests processed at 1-second intervals
```

## Tool Cache

The tool cache provides LRU (Least Recently Used) caching with TTL (Time To Live) support for tool execution results. This improves performance by avoiding redundant expensive operations.

### Configuration

```typescript
import { ToolCache, DEFAULT_TOOL_CACHE_CONFIG } from "gauss";

const toolCache = new ToolCache({
  defaultTtlMs: 300_000,      // 5 minute default TTL
  maxSize: 1000,              // Maximum 1000 cache entries
});

// Default configuration (5 minutes TTL, 1000 entries)
const defaultCache = new ToolCache(DEFAULT_TOOL_CACHE_CONFIG);
```

### Usage with Agent

```typescript
import { Agent, ToolCache } from "gauss";
import { openai } from "@ai-sdk/openai";

const toolCache = new ToolCache({
  defaultTtlMs: 600_000,      // 10 minute cache
  maxSize: 500,               // 500 cache entries
});

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are an efficient assistant that caches expensive operations.",
})
  .withToolCache(toolCache)
  .withPlanning()
  .build();

// Identical tool calls will return cached results
const result1 = await agent.run("Analyze this complex data set.");
const result2 = await agent.run("Analyze this complex data set."); // Returns cached result
```

### Manual Tool Cache Usage

```typescript
const cache = new ToolCache({ defaultTtlMs: 300_000, maxSize: 100 });

// Store with default TTL
cache.set("expensive-operation", { result: "computed value" });

// Store with custom TTL (1 hour)
cache.set("long-lived-data", { data: "important" }, 3600_000);

// Retrieve cached values
const cached = cache.get("expensive-operation");
if (cached) {
  console.log("Cache hit:", cached);
} else {
  console.log("Cache miss, need to recompute");
}

// Check cache stats
console.log("Cache stats:", cache.getStats());
// Output: { size: 2, hits: 1, misses: 0, hitRate: 1 }

// Clear cache
cache.clear();
```

### Cache Key Generation

The tool cache automatically generates cache keys based on tool name and parameters:

```typescript
// These would have different cache keys:
// - read_file("/path/to/file1.txt")
// - read_file("/path/to/file2.txt")
// - write_file("/path/to/file1.txt", "content")

// These would have the same cache key (and return cached result):
// - read_file("/path/to/file1.txt") 
// - read_file("/path/to/file1.txt") // Cache hit
```

## Combining Resilience Patterns

For maximum robustness, combine all three patterns:

```typescript
import { 
  Agent, 
  CircuitBreaker, 
  RateLimiter, 
  ToolCache 
} from "gauss";
import { openai } from "@ai-sdk/openai";

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You are a highly resilient assistant with comprehensive failure handling.",
})
  .withCircuitBreaker(new CircuitBreaker({
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    monitorWindowMs: 60_000,
  }))
  .withRateLimiter(new RateLimiter({
    maxTokens: 5,
    refillRateMs: 2000,
  }))
  .withToolCache(new ToolCache({
    defaultTtlMs: 600_000,
    maxSize: 1000,
  }))
  .withPlanning()
  .build();

// This agent will:
// 1. Cache tool results to avoid redundant work
// 2. Rate limit tool executions to prevent overwhelming services
// 3. Circuit break on repeated failures to prevent cascading issues
const result = await agent.run("Process this data with full resilience patterns.");
```

## Error Handling with Resilience

Resilience patterns integrate with Gauss's error handling system:

```typescript
import { 
  Agent, 
  CircuitBreaker, 
  CircuitBreakerError,
  RateLimiterError 
} from "gauss";

const agent = Agent.create({ model, instructions: "..." })
  .withCircuitBreaker(new CircuitBreaker())
  .withRateLimiter(new RateLimiter())
  .on("error", (event) => {
    const error = event.data;
    
    if (error instanceof CircuitBreakerError) {
      console.log("Circuit breaker blocked operation:", error.message);
    } else if (error.message.includes("rate limit")) {
      console.log("Rate limit exceeded, operation queued");
    }
  })
  .build();
```

## Best Practices

### Circuit Breaker
- Set `failureThreshold` based on your service's expected failure rate
- Use longer `resetTimeoutMs` for external services that take time to recover
- Monitor circuit breaker state in production to tune parameters

### Rate Limiter
- Set `maxTokens` to allow reasonable burst traffic
- Configure `refillRateMs` based on API rate limits or resource constraints
- Consider using separate rate limiters for different operation types

### Tool Cache
- Set `defaultTtlMs` based on how frequently your data changes
- Monitor cache hit rates and adjust `maxSize` accordingly
- Use shorter TTLs for dynamic data, longer for static reference data

### Monitoring
- Use `ObservabilityPlugin` to track resilience pattern metrics
- Set up alerts for circuit breaker state changes
- Monitor cache hit rates and rate limiter queue lengths

```typescript
import { Agent, ObservabilityPlugin } from "gauss";

const observability = new ObservabilityPlugin({
  metrics: { enabled: true },
  logging: { level: "info" },
});

const agent = Agent.create({ model, instructions: "..." })
  .withCircuitBreaker(new CircuitBreaker())
  .withRateLimiter(new RateLimiter())
  .withToolCache(new ToolCache())
  .use(observability)
  .build();

// Metrics automatically collected for resilience patterns
```