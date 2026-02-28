---
sidebar_position: 3.5
title: Workflows & Graphs
---

# Workflows & Graphs

Create complex multi-step workflows, directed acyclic graphs (DAGs), and planning systems. Gauss provides expressive DSLs for orchestrating agent work.

## WorkflowDSL

The `WorkflowDSL` enables declarative workflow construction using a fluent API.

### Basic Workflow

```typescript
import { workflow } from 'gauss';

const myWorkflow = workflow('data-pipeline')
  .then('extract', extractAgent)
  .then('transform', transformAgent)
  .then('load', loadAgent)
  .build();

const result = await myWorkflow.execute({
  input: 'raw data',
  context: { batchSize: 1000 }
});
```

### Workflow Methods

#### `.then(name, agent)`
Add a sequential step to the workflow.

```typescript
workflow('my-workflow')
  .then('step1', agent1)
  .then('step2', agent2)
  .then('step3', agent3)
```

#### `.branch(condition, trueBranch, falseBranch)`
Add conditional branching logic.

```typescript
workflow('approval-flow')
  .then('request', requesterAgent)
  .branch(
    (result) => result.amount > 1000,
    workflow('expensive').then('review', reviewerAgent),
    workflow('standard').then('auto-approve', approverAgent)
  )
  .then('process', processorAgent)
```

#### `.parallel(...steps)`
Execute multiple steps concurrently.

```typescript
workflow('analysis')
  .then('prepare', prepAgent)
  .parallel(
    { name: 'statistical', agent: statsAgent },
    { name: 'visual', agent: vizAgent },
    { name: 'textual', agent: nlpAgent }
  )
  .then('synthesize', synthesisAgent)
```

#### `.catch(handler)`
Handle errors in the workflow.

```typescript
workflow('robust-workflow')
  .then('step1', agent1)
  .then('step2', agent2)
  .catch((error) => {
    console.error('Workflow error:', error);
    return { recovered: true };
  })
```

#### `.build()`
Construct the workflow.

```typescript
const workflow = workflow('my-flow')
  .then('step1', agent1)
  // ... more steps
  .build();
```

## Graph API

Create complex multi-node graphs with directed edges:

```typescript
import { graph } from 'gauss';

const g = graph('analysis-graph')
  .node('input', inputAgent)
  .node('process1', procAgent1)
  .node('process2', procAgent2)
  .node('output', outputAgent)
  .edge('input', 'process1')
  .edge('input', 'process2')
  .edge('process1', 'output')
  .edge('process2', 'output')
  .build();

const result = await g.execute('process this data');
```

### Graph Methods

#### `.node(id, agent, options?)`
Add a node to the graph.

```typescript
graph('my-graph')
  .node('analyze', analyzer, { timeout: 30000 })
  .node('review', reviewer, { retries: 3 })
```

#### `.edge(from, to, weight?)`
Connect nodes with directed edges.

```typescript
.edge('step1', 'step2')
.edge('step1', 'step3', { weight: 2 })  // Higher priority
```

#### `.validate()`
Check graph validity (no cycles, all nodes reachable).

```typescript
const valid = graph('flow')
  .node('a', agentA)
  .node('b', agentB)
  .edge('a', 'b')
  .validate();
```

## Planning System

The planning system decomposes complex tasks into executable plans:

```typescript
import { createPlan, executePlan } from 'gauss';

// Create a plan
const plan = await createPlan(
  agent,
  'Build a web application with authentication'
);

console.log('Plan steps:');
plan.steps.forEach((step, i) => {
  console.log(`${i + 1}. ${step.description}`);
  console.log(`   Dependencies: ${step.dependencies.join(', ')}`);
  console.log(`   Resources: ${step.resources.join(', ')}`);
});

// Execute the plan
const execution = await executePlan(plan, {
  agent: projectAgent,
  parallel: false,
  reportProgress: true
});

console.log('Plan execution complete');
console.log('Completed steps:', execution.completed);
console.log('Failed steps:', execution.failed);
```

### Plan Structure

```typescript
interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  estimatedTime: number;
  resources: string[];
}

interface PlanStep {
  id: string;
  description: string;
  dependencies: string[];
  resources: string[];
  estimatedTime: number;
  subtasks?: PlanStep[];
}
```

## RAG (Retrieval-Augmented Generation) Pipeline

Build RAG systems that combine document retrieval with generation:

```typescript
import { rag } from 'gauss';
import { VectorStore } from 'gauss/providers';

const ragPipeline = rag('documentation-qa')
  .vectorStore(new VectorStore({
    type: 'pinecone',
    apiKey: process.env.PINECONE_API_KEY,
    indexName: 'docs'
  }))
  .retriever({
    topK: 5,
    minScore: 0.7
  })
  .generator(qaAgent)
  .build();

// Query the RAG system
const answer = await ragPipeline.query('How do I use workflows?');
console.log('Answer:', answer.text);
console.log('Sources:', answer.sources);
```

### RAG Configuration

```typescript
const rag = rag('custom-rag')
  .vectorStore(customVectorStore)
  .documents([
    { id: 'doc1', content: '...', metadata: { type: 'guide' } },
    { id: 'doc2', content: '...', metadata: { type: 'api' } }
  ])
  .retriever({
    topK: 3,
    minScore: 0.65,
    strategy: 'hybrid'  // 'semantic', 'keyword', 'hybrid'
  })
  .generator(generatorAgent)
  .postProcess((result) => {
    // Custom post-processing
    return result;
  })
  .build();
```

## Complete Example: Blog Writing Workflow

```typescript
import { workflow, Agent } from 'gauss';
import { OpenAI } from 'gauss/providers';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Create specialized agents
const ideaAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'Generate creative blog post ideas.',
  name: 'Idea Generator'
});

const researchAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'Research topics thoroughly and gather information.',
  name: 'Researcher'
});

const writerAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'Write engaging, well-structured blog posts.',
  name: 'Writer'
});

const editorAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'Edit for clarity, grammar, and engagement.',
  name: 'Editor'
});

const seoAgent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'Optimize content for search engines.',
  name: 'SEO Specialist'
});

// Build the workflow
const blogWorkflow = workflow('blog-pipeline')
  .then('ideate', ideaAgent)
  .then('research', researchAgent)
  .then('write', writerAgent)
  .then('edit', editorAgent)
  .then('seo', seoAgent)
  .catch((error) => {
    console.error('Blog workflow error:', error);
    return { status: 'failed', error: error.message };
  })
  .build();

// Execute
async function generateBlogPost(topic: string) {
  console.log(`📝 Starting blog post for: ${topic}`);
  
  const result = await blogWorkflow.execute({
    input: topic,
    context: {
      targetAudience: 'developers',
      length: 'medium',
      style: 'technical but accessible'
    }
  });

  console.log('✅ Blog post complete');
  console.log('Content:', result.output);
  
  return result;
}

await generateBlogPost('Getting Started with Gauss');
```

## Example: Data Processing Graph

```typescript
import { graph } from 'gauss';

const dataGraph = graph('data-pipeline')
  .node('input', sourceAgent)
  .node('validate', validationAgent)
  .node('transform', transformAgent)
  .node('enrich', enrichmentAgent)
  .node('analyze', analysisAgent)
  .node('visualize', vizAgent)
  .node('export', exportAgent)
  
  // Define flow
  .edge('input', 'validate')
  .edge('validate', 'transform')
  .edge('transform', 'enrich')
  .edge('enrich', 'analyze')
  .edge('analyze', 'visualize')
  .edge('analyze', 'export')  // Can branch
  
  .build();

const execution = await dataGraph.execute(rawData);
console.log('Pipeline results:', execution.results);
```

## Example: Planning a Project

```typescript
import { createPlan, executePlan } from 'gauss';

const projectAgent = new Agent({
  model: 'gpt-4',
  instructions: 'You are a project manager. Break down tasks and create plans.'
});

async function planAndExecuteProject(projectDescription: string) {
  // Create plan
  const plan = await createPlan(projectAgent, projectDescription);
  
  console.log('📋 Project Plan:');
  console.log(`Goal: ${plan.goal}`);
  console.log(`Estimated Time: ${plan.estimatedTime} hours`);
  console.log('\nSteps:');
  plan.steps.forEach((step, i) => {
    console.log(`\n${i + 1}. ${step.description}`);
    if (step.subtasks?.length) {
      step.subtasks.forEach(sub => {
        console.log(`   - ${sub.description}`);
      });
    }
  });

  // Execute plan
  console.log('\n🚀 Executing plan...');
  const execution = await executePlan(plan, {
    agent: projectAgent,
    parallel: true,
    reportProgress: true,
    onStepComplete: (step) => {
      console.log(`✅ Completed: ${step.description}`);
    }
  });

  console.log('\n✨ Project Complete');
  console.log('Successful steps:', execution.completed.length);
  console.log('Failed steps:', execution.failed.length);
  
  return execution;
}

await planAndExecuteProject('Build an API with authentication and database');
```

## Example: Documentation RAG System

```typescript
import { rag } from 'gauss';
import { OpenAI } from 'gauss/providers';
import { loadDocuments } from 'gauss';

const ragQA = rag('docs-qa')
  .vectorStore(/* your vector store */)
  .documents(
    await loadDocuments('./docs', {
      format: 'markdown',
      chunkSize: 1000,
      overlap: 200
    })
  )
  .retriever({
    topK: 5,
    minScore: 0.7,
    strategy: 'hybrid'
  })
  .generator(new Agent({
    model: 'gpt-4',
    provider: new OpenAI(),
    instructions: 'Answer questions using provided documentation.'
  }))
  .build();

// Query
const answer = await ragQA.query('How do I create an agent?');
console.log('Answer:', answer.text);
console.log('Sources:', answer.sources);
console.log('Confidence:', answer.confidence);
```

## Configuration Reference

### Workflow Options

| Option | Type | Description |
|--------|------|-------------|
| `timeout` | number | Step timeout in ms |
| `retries` | number | Retry failed steps |
| `parallel` | boolean | Allow parallel steps |
| `verbose` | boolean | Detailed logging |

### Graph Options

| Option | Type | Description |
|--------|------|-------------|
| `validateCycles` | boolean | Check for cycles |
| `executionMode` | 'sequential' \| 'dag' | Execution strategy |
| `timeoutPerNode` | number | Individual node timeout |

### RAG Options

| Option | Type | Description |
|--------|------|-------------|
| `topK` | number | Documents to retrieve |
| `minScore` | number | Minimum relevance score |
| `strategy` | string | 'semantic', 'keyword', 'hybrid' |
| `rerank` | boolean | Re-rank results |

## Best Practices

- **Workflow Composition**: Break complex tasks into reusable workflows
- **Error Handling**: Always include `.catch()` for robustness
- **Parallelization**: Use `.parallel()` for independent steps
- **Monitoring**: Log important checkpoints and decisions
- **Testing**: Test workflows with varied inputs
- **Documentation**: Keep workflow logic clear and documented
- **Resource Limits**: Set appropriate timeouts
- **Dependency Management**: Keep dependencies explicit in graphs
