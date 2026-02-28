// =============================================================================
// LLM NL Parser — Parses natural language into StructuredDeclaration via LLM
// Uses Gauss Agent + AI SDK Output.object for structured generation.
// =============================================================================

import { Output } from "ai";
import type { LanguageModel } from "ai";
import { StructuredDeclarationSchema, type StructuredDeclaration } from "../../domain/compiler.schema.js";
import type { NLParserPort } from "../../ports/compiler.port.js";
import { Agent } from "../../agent/agent.js";

const SYSTEM_PROMPT = `You are a workflow declaration parser. Your job is to convert natural language workflow descriptions into structured declarations.

Given a natural language description of a workflow, extract:

1. **name**: A short, descriptive name for the workflow
2. **triggers**: When should it run? (cron schedule, event-based, manual, webhook)
   - For time-based: use cron type with human-readable expression (e.g. "every 2h", "daily at 9am")
   - For event-based: use event type with event name
   - For on-demand: use manual type
3. **steps**: The ordered actions (monitor, filter, transform, publish, custom)
   - monitor: visiting a URL to check for new content (include source URL and what to look for)
   - filter: filtering content by criteria (topic, relevance, keywords)
   - transform: adapting content (rewrite tone, summarize, translate, format for platform)
   - publish: publishing to specific channels
   - custom: anything else
4. **channels**: Target platforms with their specific settings (tone, max length, format)
5. **policy**: Automation level — which channels are auto-publish, which need review

Rules:
- Extract ALL implicit information (e.g. "post to X" implies a publish step with channel "x")
- If a channel has a specific tone mentioned, set it in the channels array
- Default policy is "review" unless explicitly stated otherwise (e.g. "auto-publish", "automatically")
- Generate meaningful step IDs based on what they do
- If frequency is mentioned, create a cron trigger
- Infer platform-specific constraints (X = 280 chars, Instagram = requires image)`;

export class LLMNLParser implements NLParserPort {
  constructor(private readonly model: LanguageModel) {}

  async parse(naturalLanguage: string): Promise<StructuredDeclaration> {
    const agent = Agent.create({
      model: this.model,
      instructions: SYSTEM_PROMPT,
      maxSteps: 1,
    })
      .withOutput(Output.object({ schema: StructuredDeclarationSchema }))
      .build();

    const result = await agent.run(naturalLanguage);

    if (!result.output) {
      throw new Error("NL Parser: LLM did not produce structured output");
    }

    return result.output as StructuredDeclaration;
  }
}
