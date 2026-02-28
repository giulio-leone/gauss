---
sidebar_position: 4
title: OneCrawlPlugin
description: Web scraping and search tools via onecrawl
---

# OneCrawlPlugin

The `OneCrawlPlugin` provides web scraping and search tools powered by the `onecrawl` package. It adds three tools to the agent's toolkit.

## Installation

```bash
pnpm add onecrawl
```

## Quick Start

```typescript
import { Agent, createOneCrawlPlugin } from "gauss";

const agent = Agent.create({
  model: openai("gpt-5.2"),
  instructions: "You can search and scrape the web.",
})
  .use(createOneCrawlPlugin({
    maxContentLength: 10000,
    timeout: 30000,
  }))
  .build();

const result = await agent.run("Scrape the homepage of example.com");
```

## Configuration

```typescript
interface OneCrawlPluginOptions {
  crawler?: unknown;              // Pre-configured onecrawl Crawler instance
  maxContentLength?: number;      // Max chars per page (default: 10000)
  timeout?: number;               // Request timeout in ms (default: 30000)
  validator?: ValidationPort;     // Custom validation adapter
}
```

## Injected Tools

### `scrape`

Scrape a web page and extract its text content.

```typescript
// Input
{ url: string }  // URL to scrape

// Output
string  // Page text content (truncated to maxContentLength)
```

### `search`

Search the web and return results.

```typescript
// Input
{ query: string, limit?: number }  // 1-20 results (default: 5)

// Output
Array<{ title: string, url: string, snippet: string }>
```

### `batch`

Scrape multiple web pages in parallel.

```typescript
// Input
{ urls: string[] }  // 1-10 URLs to scrape

// Output
Array<{ url: string, content: string } | { url: string, error: string }>
```

## Lazy Initialization

The crawler is initialized lazily on first tool use. If no `crawler` instance is provided, the plugin dynamically imports `onecrawl` and creates one.

## Cleanup

Call `dispose()` (or `agent.dispose()`) to close the crawler connection:

```typescript
await agent.dispose();
```
