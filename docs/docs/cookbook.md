---
sidebar_position: 3
title: Cookbook
description: 20+ practical recipes for building agents with Gauss AI framework
---

# Gauss Cookbook

Practical, copy-pasteable recipes for building AI agents with Gauss. Each recipe is self-contained and ready to run.

## 1. Hello World Agent

The simplest possible agent—one line of code.

```typescript
import { gauss } from 'gauss';

async function main() {
  const result = await gauss('What is 2 + 2?');
  console.log(result);
}

main();
```

## 2. Custom Tool Agent

Create an agent with custom tools for weather and calculations.

```typescript
import { gauss, createAgent, tool } from 'gauss';

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: { city: 'string' },
  execute: async ({ city }) => {
    // Mock weather API
    return `${city}: 72°F, Sunny`;
  },
});

const calculatorTool = tool({
  name: 'calculate',
  description: 'Perform math calculations',
  parameters: { expression: 'string' },
  execute: async ({ expression }) => {
    try {
      return `Result: ${eval(expression)}`;
    } catch (e) {
      return `Error: ${e.message}`;
    }
  },
});

async function main() {
  const agent = createAgent({
    tools: [weatherTool, calculatorTool],
    model: 'gpt-4',
  });

  const result = await agent.run('What is the weather in Paris and what is 15 * 8?');
  console.log(result);
}

main();
```

## 3. RAG Chatbot

Ingest documents, embed them, retrieve relevant chunks, and answer questions.

```typescript
import { gauss, createRAGPipeline } from 'gauss';

async function main() {
  // Create RAG pipeline
  const rag = createRAGPipeline({
    embeddingModel: 'text-embedding-3-small',
    llmModel: 'gpt-4',
    chunkSize: 500,
    overlapSize: 50,
  });

  // Ingest documents
  await rag.ingest([
    {
      id: 'doc1',
      text: 'Gauss is an AI agent framework. It provides tools, memory, and orchestration.',
    },
    {
      id: 'doc2',
      text: 'Agents can have custom tools, use RAG, and form teams for complex tasks.',
    },
  ]);

  // Query
  const answer = await rag.query('What is Gauss?');
  console.log(answer);
}

main();
```

## 4. Multi-Agent Team

Coordinator delegates to specialists, each with different tools.

```typescript
import { gauss, createTeam, createAgent } from 'gauss';

async function main() {
  // Create specialist agents
  const dataAnalyst = createAgent({
    name: 'data_analyst',
    model: 'gpt-4',
    systemPrompt: 'You are a data analysis expert.',
  });

  const dataEngineer = createAgent({
    name: 'data_engineer',
    model: 'gpt-4',
    systemPrompt: 'You are a data engineering expert.',
  });

  // Create team with coordinator
  const team = createTeam({
    coordinator: createAgent({
      name: 'coordinator',
      model: 'gpt-4',
      systemPrompt: 'You delegate tasks to the right specialists.',
    }),
    members: [dataAnalyst, dataEngineer],
    delegationStrategy: 'skill-match',
  });

  // Run task
  const result = await team.run(
    'Extract sales data from a CSV and identify top 3 regions by revenue'
  );
  console.log(result);
}

main();
```

## 5. Pipeline Workflow

Build an ETL pipeline with branching and parallel execution.

```typescript
import { gauss, createPipeline } from 'gauss';

async function main() {
  const pipeline = createPipeline()
    .then(async (input) => {
      console.log('Extract:', input);
      return { raw: input, timestamp: Date.now() };
    })
    .then(async (data) => {
      console.log('Transform:', data);
      return { ...data, transformed: true };
    })
    .branch(
      async (data) => {
        // Branch 1: Load to warehouse
        console.log('Loading to warehouse...');
        return { ...data, warehouse: true };
      },
      async (data) => {
        // Branch 2: Load to cache
        console.log('Loading to cache...');
        return { ...data, cache: true };
      }
    )
    .parallel([
      async (data) => ({ ...data, metric1: Math.random() }),
      async (data) => ({ ...data, metric2: Math.random() }),
    ])
    .then(async (results) => {
      console.log('Final output:', results);
      return results;
    });

  await pipeline.run('Sample data');
}

main();
```

## 6. Voice Assistant

Speech-to-text → Agent → Text-to-speech pipeline.

```typescript
import { gauss, createAgent, createVoicePipeline } from 'gauss';

async function main() {
  const agent = createAgent({
    model: 'gpt-4',
    systemPrompt: 'You are a helpful voice assistant.',
  });

  const voicePipeline = createVoicePipeline({
    sttProvider: 'openai-whisper',
    ttsProvider: 'openai-tts',
    agent: agent,
  });

  // Process audio file
  const result = await voicePipeline.process({
    audioPath: './sample.wav',
    language: 'en',
  });

  console.log('Transcription:', result.transcription);
  console.log('Response:', result.response);
  console.log('Audio output saved to:', result.audioPath);
}

main();
```

## 7. Image Analyzer

Describe images, extract text (OCR), and compare multiple images.

```typescript
import { gauss, createAgent, tool } from 'gauss';

const imageAnalyzerTool = tool({
  name: 'analyze_image',
  description: 'Analyze an image, extract text, and describe content',
  parameters: { imagePath: 'string' },
  execute: async ({ imagePath }) => {
    // Mock vision API
    return {
      description: 'A sunny day with blue sky and green trees',
      text: 'Welcome to Gauss',
      objects: ['sky', 'trees', 'person'],
    };
  },
});

const compareImagesTool = tool({
  name: 'compare_images',
  description: 'Compare two images and find differences',
  parameters: { image1Path: 'string', image2Path: 'string' },
  execute: async ({ image1Path, image2Path }) => {
    // Mock comparison API
    return {
      similarity: 0.85,
      differences: ['Different lighting', 'Person in second image'],
    };
  },
});

async function main() {
  const agent = createAgent({
    tools: [imageAnalyzerTool, compareImagesTool],
    model: 'gpt-4-vision',
  });

  const result = await agent.run(
    'Describe image.jpg and compare it to image2.jpg'
  );
  console.log(result);
}

main();
```

## 8. Video Summarizer

Extract frames from video and describe content to create summaries.

```typescript
import { gauss, createAgent, tool } from 'gauss';

const frameExtractorTool = tool({
  name: 'extract_frames',
  description: 'Extract frames from a video at intervals',
  parameters: { videoPath: 'string', interval: 'number' },
  execute: async ({ videoPath, interval }) => {
    // Mock frame extraction
    return [
      { frameNumber: 0, timestamp: '00:00:00' },
      { frameNumber: 30, timestamp: '00:01:00' },
      { frameNumber: 60, timestamp: '00:02:00' },
    ];
  },
});

async function main() {
  const agent = createAgent({
    tools: [frameExtractorTool],
    model: 'gpt-4-vision',
    systemPrompt: 'Summarize videos by analyzing extracted frames.',
  });

  const result = await agent.run(
    'Summarize video.mp4 by extracting frames every 30 frames'
  );
  console.log(result);
}

main();
```

## 9. Code Review Agent

Agent that reviews code using linting and analysis tools.

```typescript
import { gauss, createAgent, tool } from 'gauss';

const lintTool = tool({
  name: 'lint_code',
  description: 'Lint code for style and error issues',
  parameters: { code: 'string', language: 'string' },
  execute: async ({ code, language }) => {
    // Mock linting
    return {
      issues: [
        { line: 5, message: 'Variable unused', severity: 'warning' },
        { line: 12, message: 'Missing error handling', severity: 'error' },
      ],
    };
  },
});

const analyzeTool = tool({
  name: 'analyze_code',
  description: 'Analyze code for complexity, security, and performance',
  parameters: { code: 'string' },
  execute: async ({ code }) => {
    return {
      complexity: 'medium',
      security_issues: ['SQL injection risk'],
      performance: 'could use caching',
    };
  },
});

async function main() {
  const codeReviewer = createAgent({
    tools: [lintTool, analyzeTool],
    model: 'gpt-4',
    systemPrompt:
      'You are an expert code reviewer. Review code thoroughly and provide actionable feedback.',
  });

  const result = await codeReviewer.run(`
    Review this code:
    function getUserData(id) {
      const query = "SELECT * FROM users WHERE id=" + id;
      return db.query(query);
    }
  `);

  console.log(result);
}

main();
```

## 10. Customer Support Bot

Agent with memory, escalation, and multi-tool support.

```typescript
import { gauss, createAgent, tool, createMemory } from 'gauss';

const ticketTool = tool({
  name: 'create_ticket',
  description: 'Create a support ticket for escalation',
  parameters: { issue: 'string', priority: 'string' },
  execute: async ({ issue, priority }) => {
    return { ticketId: 'TICKET-' + Date.now(), status: 'created' };
  },
});

const knowledgeBaseTool = tool({
  name: 'search_kb',
  description: 'Search knowledge base for common issues',
  parameters: { query: 'string' },
  execute: async ({ query }) => {
    // Mock KB search
    const articles = {
      'password reset': 'Visit /reset-password and follow the steps',
      'billing issue': 'Contact billing@company.com',
      'account delete': 'Submit request in Account Settings',
    };
    return articles[query] || 'No articles found';
  },
});

async function main() {
  const memory = createMemory({ type: 'conversation' });

  const supportBot = createAgent({
    tools: [ticketTool, knowledgeBaseTool],
    model: 'gpt-4',
    memory: memory,
    systemPrompt:
      'You are a helpful customer support agent. Try to resolve issues with the knowledge base. Escalate complex issues to tickets.',
  });

  // Multi-turn conversation
  let result = await supportBot.run('I forgot my password');
  console.log('Response 1:', result);

  result = await supportBot.run('I already tried that, please create a ticket');
  console.log('Response 2:', result);
}

main();
```

## 11. Research Assistant

Agent that searches the web and synthesizes information.

```typescript
import { gauss, createAgent, tool } from 'gauss';

const webSearchTool = tool({
  name: 'web_search',
  description: 'Search the web for information',
  parameters: { query: 'string', maxResults: 'number' },
  execute: async ({ query, maxResults = 5 }) => {
    // Mock web search
    return [
      { title: 'Result 1', url: 'example.com/1', snippet: 'Content...' },
      { title: 'Result 2', url: 'example.com/2', snippet: 'Content...' },
    ];
  },
});

const fetchUrlTool = tool({
  name: 'fetch_url',
  description: 'Fetch and extract content from a URL',
  parameters: { url: 'string' },
  execute: async ({ url }) => {
    // Mock URL fetching
    return 'Full page content here...';
  },
});

async function main() {
  const researcher = createAgent({
    tools: [webSearchTool, fetchUrlTool],
    model: 'gpt-4',
    systemPrompt:
      'You are a research assistant. Search for information, fetch relevant pages, and synthesize findings into a coherent report.',
  });

  const result = await researcher.run(
    'Research the latest trends in AI agents and provide a summary'
  );
  console.log(result);
}

main();
```

## 12. Data Extraction Pipeline

Graph with parallel extractors for structured data.

```typescript
import { gauss, createPipeline } from 'gauss';

async function main() {
  const pipeline = createPipeline()
    .then(async (input) => {
      // Input: raw document
      return { document: input, parsed: true };
    })
    .parallel([
      async (data) => {
        // Extract named entities
        return { ...data, entities: ['Company A', 'Person B'] };
      },
      async (data) => {
        // Extract relationships
        return { ...data, relationships: [['Company A', 'works with', 'Person B']] };
      },
      async (data) => {
        // Extract amounts
        return { ...data, amounts: [100000, 50000] };
      },
    ])
    .then(async (results) => {
      // Merge results
      return {
        entities: results[0].entities,
        relationships: results[1].relationships,
        amounts: results[2].amounts,
      };
    });

  const output = await pipeline.run('Raw document text...');
  console.log('Extracted data:', output);
}

main();
```

## 13. Content Moderation

Agent with guardrails plugin to moderate content.

```typescript
import { gauss, createAgent, plugin } from 'gauss';

const moderationPlugin = plugin({
  name: 'content_moderation',
  description: 'Prevent unsafe content generation',
  beforeExecution: async (input) => {
    const unsafe = ['explicit', 'offensive', 'dangerous'];
    if (unsafe.some((word) => input.toLowerCase().includes(word))) {
      throw new Error('Input contains unsafe content');
    }
    return input;
  },
  afterExecution: async (output) => {
    // Check output as well
    return output;
  },
});

async function main() {
  const moderator = createAgent({
    model: 'gpt-4',
    plugins: [moderationPlugin],
    systemPrompt: 'You are a helpful assistant. Decline inappropriate requests.',
  });

  try {
    const result = await moderator.run('Write something helpful');
    console.log(result);
  } catch (e) {
    console.log('Moderation blocked:', e.message);
  }
}

main();
```

## 14. LLM Testing with Recording

Record and replay LLM calls for deterministic tests.

```typescript
import { gauss, createAgent, createRecorder } from 'gauss';

async function main() {
  const recorder = createRecorder({ filepath: './test_recordings.json' });

  const agent = createAgent({
    model: 'gpt-4',
    recorder: recorder,
    recorderMode: 'record', // or 'replay' for tests
  });

  // Record mode: saves actual LLM calls
  const result1 = await agent.run('What is 2+2?');
  console.log('Recording:', result1);

  // Later, switch to replay mode for tests
  // This will return recorded responses instead of calling LLM
  const testAgent = createAgent({
    model: 'gpt-4',
    recorder: recorder,
    recorderMode: 'replay',
  });

  const testResult = await testAgent.run('What is 2+2?');
  console.log('Replayed:', testResult);
}

main();
```

## 15. Visual Agent Builder

Create agents from JSON configuration.

```typescript
import { gauss, createAgentFromConfig } from 'gauss';

async function main() {
  const agentConfig = {
    name: 'content_creator',
    model: 'gpt-4',
    systemPrompt: 'You are a creative content writer.',
    tools: [
      {
        name: 'search_images',
        description: 'Search for images',
        parameters: { query: { type: 'string' } },
      },
      {
        name: 'generate_title',
        description: 'Generate catchy titles',
        parameters: { topic: { type: 'string' } },
      },
    ],
    memory: { type: 'conversation', maxTurns: 10 },
    plugins: ['content_moderation'],
  };

  const agent = createAgentFromConfig(agentConfig);

  const result = await agent.run('Create a blog post about AI');
  console.log(result);
}

main();
```

## 16. Streaming Response

Real-time token streaming for responsive UIs.

```typescript
import { gauss, createAgent } from 'gauss';

async function main() {
  const agent = createAgent({
    model: 'gpt-4',
    streaming: true,
  });

  console.log('Streaming response:');

  const stream = await agent.stream('Write a poem about programming');

  for await (const chunk of stream) {
    process.stdout.write(chunk.token);
  }

  console.log('\n✓ Complete');
}

main();
```

## 17. MCP Client

Connect to Model Context Protocol servers for expanded tools.

```typescript
import { gauss, createAgent, createMCPClient } from 'gauss';

async function main() {
  const mcpClient = createMCPClient({
    serverUrl: 'http://localhost:3000/mcp',
  });

  // Connect to MCP server
  const tools = await mcpClient.getTools();
  console.log('Available MCP tools:', tools);

  const agent = createAgent({
    model: 'gpt-4',
    mcpClient: mcpClient,
  });

  // Agent can now use tools from MCP server
  const result = await agent.run(
    'Use available tools to complete this task: fetch weather data'
  );
  console.log(result);
}

main();
```

## 18. PostgreSQL Memory

Persistent agent memory with PostgreSQL backend.

```typescript
import { gauss, createAgent, createMemory } from 'gauss';

async function main() {
  const memory = createMemory({
    type: 'postgresql',
    connectionString: 'postgresql://user:password@localhost/gauss_memory',
    tableName: 'agent_conversations',
    autoCleanup: { enabled: true, maxAge: '30 days' },
  });

  const agent = createAgent({
    model: 'gpt-4',
    memory: memory,
    systemPrompt: 'You are a helpful assistant with persistent memory.',
  });

  // Conversation is automatically persisted
  let result = await agent.run('Remember: My name is Alice');
  console.log('Turn 1:', result);

  // Memory persists across sessions
  result = await agent.run('What is my name?');
  console.log('Turn 2:', result);
}

main();
```

## 19. Agent with Planning

Multi-step task decomposition and execution planning.

```typescript
import { gauss, createAgent, createPlanner } from 'gauss';

async function main() {
  const planner = createPlanner({
    model: 'gpt-4',
    strategy: 'hierarchical', // or 'linear', 'tree'
  });

  const agent = createAgent({
    model: 'gpt-4',
    planner: planner,
    systemPrompt: 'You are a task execution agent.',
  });

  // Complex task automatically decomposed
  const plan = await agent.createPlan(
    'Build a marketing campaign: research audience, create content, schedule posts'
  );

  console.log('Generated plan:', plan.steps);

  // Execute plan
  const result = await agent.executePlan(plan);
  console.log('Results:', result);
}

main();
```

## 20. Error Handling

Comprehensive error handling with retry patterns and suggestions.

```typescript
import {
  gauss,
  createAgent,
  GaussError,
  RetryPolicy,
} from 'gauss';

async function main() {
  const retryPolicy = new RetryPolicy({
    maxRetries: 3,
    backoff: 'exponential',
    baseDelay: 1000,
  });

  const agent = createAgent({
    model: 'gpt-4',
    retryPolicy: retryPolicy,
    errorHandler: async (error) => {
      if (error instanceof GaussError) {
        console.log('Error code:', error.code);
        console.log('Suggestions:', error.suggestions);
        console.log('Recoverable:', error.isRecoverable);
      }
      throw error;
    },
  });

  try {
    const result = await agent.run('Process this data...');
    console.log(result);
  } catch (error) {
    if (error instanceof GaussError) {
      console.log(`Error: ${error.message}`);
      console.log(`Try: ${error.suggestions.join(', ')}`);
    } else {
      console.log('Unexpected error:', error);
    }
  }
}

main();
```

## 21. Universal Provider

Use any AI SDK provider dynamically without changing code.

```typescript
import { gauss, createAgent, useProvider } from 'gauss';

async function main() {
  // Switch providers at runtime
  const providers = ['openai', 'anthropic', 'google', 'cohere'];

  for (const providerName of providers) {
    // Initialize provider
    await useProvider(providerName, {
      apiKey: process.env[`${providerName.toUpperCase()}_API_KEY`],
    });

    const agent = createAgent({
      provider: providerName,
      model: getModelForProvider(providerName),
    });

    const result = await agent.run('What is AI?');
    console.log(`${providerName}: ${result}`);
  }

  function getModelForProvider(provider: string): string {
    const models = {
      openai: 'gpt-4',
      anthropic: 'claude-3-opus',
      google: 'gemini-pro',
      cohere: 'command',
    };
    return models[provider] || 'default';
  }
}

main();
```

---

## Tips for Production

- **Rate limiting**: Use `agent.configure({ rateLimit: 100 })` for API rate management
- **Caching**: Enable response caching with `cache: { ttl: 3600 }`
- **Monitoring**: Integrate with observability tools via plugins
- **Testing**: Use recording mode to create deterministic test suites
- **Error recovery**: Always implement retry policies and error handlers
- **Memory management**: Set appropriate memory limits and cleanup policies
- **Security**: Validate user inputs and use moderation guardrails

## Next Steps

- Explore [API Reference](/docs/api-reference/ports) for detailed documentation
- Check [Workflows & Graphs](/docs/workflows) for complex scenarios
- Visit [GitHub](https://github.com/giulio-leone/gauss) for questions and discussions
