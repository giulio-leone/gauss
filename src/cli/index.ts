#!/usr/bin/env node
// =============================================================================
// OneAgent CLI — Main entry point
// =============================================================================

import { parseArgs } from "node:util";
import { setKey, deleteKey, listKeys, resolveApiKey, envVarName } from "./config.js";
import { createModel, isValidProvider, SUPPORTED_PROVIDERS, getDefaultModel } from "./providers.js";
import type { ProviderName } from "./providers.js";
import { runChat } from "./commands/chat.js";
import { demoGuardrails, demoWorkflow, demoGraph, demoObservability } from "./commands/demo.js";
import { startRepl } from "./repl.js";
import { color, bold } from "./format.js";

const VERSION = "0.1.0";

const HELP = `
${bold("OneAgent CLI")} — AI Agent Framework

${bold("Usage:")}
  oneagent chat [--provider <name>] [--model <id>] [--api-key <key>]
  oneagent run "<prompt>" [--provider <name>] [--model <id>] [--api-key <key>]
  oneagent config set <provider> <api-key>
  oneagent config list
  oneagent config delete <provider>
  oneagent demo <type> [--provider <name>] [--api-key <key>]
  oneagent --help | --version

${bold("Commands:")}
  chat        Start interactive REPL chat session
  run         Single-shot prompt execution
  config      Manage API keys in ~/.oneagentrc
  demo        Run feature demos (guardrails, workflow, graph, observability)

${bold("Options:")}
  --provider  AI provider (${SUPPORTED_PROVIDERS.join(", ")})
  --model     Model ID override (e.g. gpt-4o-mini, claude-sonnet-4-20250514)
  --api-key   API key (overrides config file and env vars)
  --help      Show this help
  --version   Show version

${bold("Environment Variables:")}
  OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY,
  GROQ_API_KEY, MISTRAL_API_KEY

${bold("Examples:")}
  oneagent chat --provider openai --api-key sk-...
  oneagent run "What is the capital of France?" --provider anthropic
  oneagent config set openai sk-...
  oneagent demo guardrails --provider openai
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      "api-key": { type: "string", short: "k" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    strict: false,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.version) {
    console.log(`oneagent v${VERSION}`);
    return;
  }

  const command = positionals[0];

  if (!command) {
    console.log(HELP);
    return;
  }

  switch (command) {
    case "config":
      return handleConfig(positionals.slice(1));

    case "chat":
      return handleChat(values as Record<string, string | undefined>);

    case "run":
      return handleRun(
        positionals.slice(1).join(" "),
        values as Record<string, string | undefined>,
      );

    case "demo":
      return handleDemo(
        positionals[1],
        values as Record<string, string | undefined>,
      );

    default:
      console.error(color("red", `Unknown command: ${command}`));
      console.log(color("dim", "Run 'oneagent --help' for usage.\n"));
      process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

function handleConfig(args: string[]): void {
  const subcommand = args[0];

  switch (subcommand) {
    case "set": {
      const provider = args[1];
      const apiKey = args[2];
      if (!provider || !apiKey) {
        console.error(color("red", "Usage: oneagent config set <provider> <api-key>"));
        process.exitCode = 1;
        return;
      }
      if (!isValidProvider(provider)) {
        console.error(color("red", `Unknown provider: ${provider}`));
        console.log(color("dim", `Available: ${SUPPORTED_PROVIDERS.join(", ")}`));
        process.exitCode = 1;
        return;
      }
      setKey(provider, apiKey);
      console.log(color("green", `✓ API key saved for ${provider}`));
      break;
    }

    case "list": {
      const keys = listKeys();
      const entries = Object.entries(keys);
      if (entries.length === 0) {
        console.log(color("dim", "No API keys configured. Use: oneagent config set <provider> <key>"));
        return;
      }
      console.log(bold("\nConfigured API keys:"));
      for (const [provider, key] of entries) {
        const masked = key.length > 16
          ? key.slice(0, 8) + "..." + key.slice(-4)
          : key.slice(0, 4) + "****";
        console.log(`  ${provider}: ${color("dim", masked)}`);
      }
      console.log();
      break;
    }

    case "delete": {
      const provider = args[1];
      if (!provider) {
        console.error(color("red", "Usage: oneagent config delete <provider>"));
        process.exitCode = 1;
        return;
      }
      if (deleteKey(provider)) {
        console.log(color("green", `✓ API key deleted for ${provider}`));
      } else {
        console.log(color("yellow", `No API key found for ${provider}`));
      }
      break;
    }

    default:
      console.error(color("red", "Usage: oneagent config [set|list|delete]"));
      process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat (REPL)
// ─────────────────────────────────────────────────────────────────────────────

async function handleChat(opts: Record<string, string | undefined>): Promise<void> {
  const { provider, model, apiKey } = await resolveProviderAndModel(opts);
  const languageModel = await createModel(provider, apiKey, model);
  await startRepl(languageModel, provider, apiKey, model);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run (single-shot)
// ─────────────────────────────────────────────────────────────────────────────

async function handleRun(
  prompt: string,
  opts: Record<string, string | undefined>,
): Promise<void> {
  if (!prompt.trim()) {
    console.error(color("red", 'Usage: oneagent run "<prompt>" --provider <name>'));
    process.exitCode = 1;
    return;
  }
  const { provider, model, apiKey } = await resolveProviderAndModel(opts);
  const languageModel = await createModel(provider, apiKey, model);
  await runChat(prompt, languageModel);
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo
// ─────────────────────────────────────────────────────────────────────────────

const DEMO_TYPES = ["guardrails", "workflow", "graph", "observability"] as const;

async function handleDemo(
  demoType: string | undefined,
  opts: Record<string, string | undefined>,
): Promise<void> {
  if (!demoType || !(DEMO_TYPES as readonly string[]).includes(demoType)) {
    console.error(color("red", `Usage: oneagent demo <${DEMO_TYPES.join("|")}> --provider <name>`));
    process.exitCode = 1;
    return;
  }
  const { provider, model, apiKey } = await resolveProviderAndModel(opts);
  const languageModel = await createModel(provider, apiKey, model);

  switch (demoType) {
    case "guardrails":
      return demoGuardrails(languageModel);
    case "workflow":
      return demoWorkflow(languageModel);
    case "graph":
      return demoGraph(languageModel);
    case "observability":
      return demoObservability(languageModel);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveProviderAndModel(
  opts: Record<string, string | undefined>,
): Promise<{ provider: ProviderName; model: string | undefined; apiKey: string }> {
  const providerName = opts.provider ?? "openai";

  if (!isValidProvider(providerName)) {
    console.error(color("red", `Unknown provider: ${providerName}`));
    console.log(color("dim", `Available: ${SUPPORTED_PROVIDERS.join(", ")}`));
    process.exit(1);
  }

  const apiKey = resolveApiKey(providerName, opts["api-key"]);
  if (!apiKey) {
    console.error(color("red", `No API key for provider "${providerName}".`));
    console.log(color("dim", "Set one with:"));
    console.log(color("dim", `  oneagent config set ${providerName} <your-api-key>`));
    console.log(color("dim", `  --api-key <your-api-key>`));
    console.log(color("dim", `  Or set ${envVarName(providerName)} environment variable`));
    process.exit(1);
  }

  return {
    provider: providerName,
    model: opts.model,
    apiKey,
  };
}

main().catch((err) => {
  console.error(color("red", `\n✗ Fatal error: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exitCode = 1;
});
