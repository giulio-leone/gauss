// =============================================================================
// Template: Multi-Agent Workflow — Orchestrated agent collaboration
// =============================================================================
// gauss init --template multi-agent
//
// Multiple specialized agents collaborating through a graph workflow.
// =============================================================================

import { agent, graph } from "gauss";
import { openai } from "gauss/providers";

// 1. Define specialized agents
const researcher = agent({
  model: openai("gpt-5.2"),
  instructions: `You are a research analyst. Gather and summarize key facts about the given topic.
Output a structured summary with bullet points.`,
}).build();

const writer = agent({
  model: openai("gpt-5.2"),
  instructions: `You are a professional writer. Take research notes and produce a polished article.
Write clearly, use headers, and make it engaging.`,
}).build();

const editor = agent({
  model: openai("gpt-5.2-mini"),
  instructions: `You are an editor. Review the article for clarity, grammar, and completeness.
Provide the final polished version.`,
}).build();

// 2. Create workflow graph
const articleWorkflow = graph({
  name: "article-pipeline",
  nodes: {
    research: {
      agent: researcher,
      inputs: ["topic"],
    },
    write: {
      agent: writer,
      inputs: ["research"],
      dependsOn: ["research"],
    },
    edit: {
      agent: editor,
      inputs: ["write"],
      dependsOn: ["write"],
    },
  },
  output: "edit",
});

// 3. Execute
const result = await articleWorkflow.run({
  topic: "The future of AI agents in software development",
});

console.log("=== Final Article ===");
console.log(result.text);
