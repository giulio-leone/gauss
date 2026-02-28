---
sidebar_position: 5
title: Multi-Agent Teams
---

# Multi-Agent Teams

Build collaborative systems where multiple specialized agents work together toward a common goal. Gauss provides a powerful TeamBuilder API for orchestrating agent coordination.

## TeamBuilder API

The `TeamBuilder` provides a fluent interface for constructing agent teams:

```typescript
import { TeamBuilder } from 'gauss';

const team = new TeamBuilder()
  .id('research-team')
  .coordinator(coordinatorAgent)
  .specialist('researcher', researchAgent)
  .specialist('writer', writerAgent)
  .specialist('editor', editorAgent)
  .strategy('pipeline')
  .build();
```

### Core Methods

#### `.id(teamId: string)`
Set a unique identifier for the team.

```typescript
const team = new TeamBuilder()
  .id('my-team')
```

#### `.coordinator(agent: Agent)`
Specify the coordinator agent that orchestrates team activities.

```typescript
const coordinator = new Agent({
  model: 'gpt-4',
  instructions: 'You coordinate between team members.'
});

.coordinator(coordinator)
```

#### `.specialist(name: string, agent: Agent)`
Add specialized agents to the team.

```typescript
.specialist('data-analyst', analyticsAgent)
.specialist('developer', devAgent)
```

#### `.strategy(strategyType: string)`
Define how agents coordinate. Options: `'round-robin'`, `'delegate'`, `'broadcast'`, `'pipeline'`.

```typescript
.strategy('delegate')  // Coordinator delegates to specialists
```

#### `.build()`
Construct and return the team.

```typescript
const team = new TeamBuilder()
  // ... configuration
  .build();
```

## Coordination Strategies

### Round-Robin

Each specialist handles tasks sequentially:

```typescript
const team = new TeamBuilder()
  .id('qa-team')
  .coordinator(coordinator)
  .specialist('unit-tester', unitTestAgent)
  .specialist('integration-tester', integrationAgent)
  .specialist('performance-tester', perfAgent)
  .strategy('round-robin')
  .build();

// Each specialist gets a turn
const results = await team.run('Test the payment module');
```

### Delegate

Coordinator delegates to the most appropriate specialist:

```typescript
const team = new TeamBuilder()
  .id('support-team')
  .coordinator(supportCoordinator)
  .specialist('technical', techAgent)
  .specialist('billing', billingAgent)
  .specialist('general', generalAgent)
  .strategy('delegate')
  .build();

// Coordinator routes requests intelligently
const response = await team.run('Why was I charged twice?');
```

### Broadcast

All specialists work on the task simultaneously:

```typescript
const team = new TeamBuilder()
  .id('code-review-team')
  .coordinator(reviewCoordinator)
  .specialist('architecture', archReviewer)
  .specialist('security', securityReviewer)
  .specialist('performance', perfReviewer)
  .strategy('broadcast')
  .build();

// All reviewers analyze the same code
const reviews = await team.run('Review this authentication module');
```

### Pipeline

Specialists process tasks sequentially, each building on previous work:

```typescript
const team = new TeamBuilder()
  .id('content-pipeline')
  .coordinator(contentCoordinator)
  .specialist('researcher', researchAgent)
  .specialist('writer', writerAgent)
  .specialist('editor', editorAgent)
  .specialist('publisher', publishAgent)
  .strategy('pipeline')
  .build();

// Output of one feeds into the next
const output = await team.run('Write an article about AI');
```

## Team Execution

### Basic Execution

```typescript
const result = await team.run('Task description');
console.log('Result:', result.output);
console.log('Consensus:', result.consensus);
console.log('Contributions:', result.contributions);
```

### With Configuration

```typescript
const result = await team.run(
  'Create a project proposal',
  {
    timeout: 60000,
    maxIterations: 3,
    verbose: true
  }
);
```

### Streaming Results

```typescript
const stream = team.stream('Complex task');

for await (const event of stream) {
  if (event.type === 'specialist-response') {
    console.log(`${event.specialist}: ${event.message}`);
  }
  if (event.type === 'coordinator-decision') {
    console.log(`Coordinator: ${event.decision}`);
  }
}
```

## Example: Development Team

```typescript
import { Agent, TeamBuilder } from 'gauss';
import { OpenAI } from 'gauss/providers';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create specialist agents
const architectAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'You are a software architect. Design system architecture.',
  name: 'Architect'
});

const implementerAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'You are a senior developer. Write high-quality code.',
  name: 'Implementer'
});

const testerAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'You are a QA engineer. Identify edge cases and test scenarios.',
  name: 'QA Engineer'
});

const coordinatorAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'You coordinate the development team. Ensure quality deliverables.',
  name: 'Tech Lead'
});

// Build development team
const devTeam = new TeamBuilder()
  .id('dev-team')
  .coordinator(coordinatorAgent)
  .specialist('architect', architectAgent)
  .specialist('implementer', implementerAgent)
  .specialist('tester', testerAgent)
  .strategy('pipeline')
  .build();

// Execute development task
async function developFeature(featureRequest: string) {
  console.log('🚀 Starting feature development:', featureRequest);
  
  const result = await devTeam.run(featureRequest, {
    timeout: 120000,
    verbose: true
  });
  
  console.log('\n✅ Development Complete');
  console.log('Architecture:', result.contributions.architect);
  console.log('Implementation:', result.contributions.implementer);
  console.log('Test Plan:', result.contributions.tester);
  console.log('Final Output:', result.output);
  
  return result;
}

// Usage
await developFeature('Build a user authentication module with JWT');
```

## Example: Research Team

```typescript
const researchTeam = new TeamBuilder()
  .id('research-team')
  .coordinator(
    new Agent({
      model: 'gpt-4',
      instructions: 'Orchestrate research synthesis.',
      name: 'Research Director'
    })
  )
  .specialist('literature', new Agent({
    model: 'gpt-4',
    instructions: 'Search and review academic literature.',
    name: 'Literature Researcher'
  }))
  .specialist('data', new Agent({
    model: 'gpt-4',
    instructions: 'Analyze empirical data and statistics.',
    name: 'Data Analyst'
  }))
  .specialist('synthesis', new Agent({
    model: 'gpt-4',
    instructions: 'Synthesize findings into coherent insights.',
    name: 'Research Analyst'
  }))
  .strategy('broadcast')  // All examine the research question
  .build();

const findings = await researchTeam.run(
  'Research: What are the latest breakthroughs in quantum computing?'
);
```

## Example: Content Pipeline

```typescript
const contentPipeline = new TeamBuilder()
  .id('content-pipeline')
  .coordinator(
    new Agent({
      model: 'gpt-4',
      instructions: 'Manage the content workflow.',
      name: 'Content Manager'
    })
  )
  .specialist('ideation', new Agent({
    model: 'gpt-4',
    instructions: 'Generate creative content ideas.',
    name: 'Creative Director'
  }))
  .specialist('research', new Agent({
    model: 'gpt-4',
    instructions: 'Research and validate content ideas.',
    name: 'Research Specialist'
  }))
  .specialist('writing', new Agent({
    model: 'gpt-4',
    instructions: 'Write engaging, well-researched content.',
    name: 'Content Writer'
  }))
  .specialist('editing', new Agent({
    model: 'gpt-4',
    instructions: 'Edit for clarity, tone, and engagement.',
    name: 'Editor'
  }))
  .specialist('seo', new Agent({
    model: 'gpt-4',
    instructions: 'Optimize for search engines.',
    name: 'SEO Specialist'
  }))
  .strategy('pipeline')
  .build();

const article = await contentPipeline.run(
  'Create a blog post about the future of AI in healthcare'
);
```

## Team Configuration Reference

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Team identifier |
| `coordinator` | Agent | Orchestrating agent |
| `specialists` | `Map<string, Agent>` | Named specialist agents |
| `strategy` | string | Coordination strategy |
| `timeout` | number | Execution timeout (ms) |
| `maxIterations` | number | Max coordination cycles |

## Best Practices

- **Role Clarity**: Give each agent clear, distinct responsibilities
- **Coordinator Authority**: Empower coordinator to make final decisions
- **Strategy Selection**: Choose strategy that fits your problem
  - **Pipeline**: Sequential workflows (ideal for content/design)
  - **Broadcast**: Complex analysis requiring multiple perspectives
  - **Delegate**: Customer support and routing scenarios
  - **Round-Robin**: Equal workload distribution
- **Monitor Consensus**: Check confidence scores in results
- **Handle Disagreements**: Use coordinator to resolve conflicts
- **Resource Limits**: Set appropriate timeouts and iteration limits
