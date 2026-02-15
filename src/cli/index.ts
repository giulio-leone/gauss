#!/usr/bin/env node
// =============================================================================
// GaussFlow CLI — Main entry point
// =============================================================================

import { parseArgs } from "node:util";
import { setKey, deleteKey, listKeys, resolveApiKey, envVarName, setDefaultProvider, setDefaultModel, getDefaultProvider, getDefaultModelFromConfig, loadConfig } from "./config.js";
import { createModel, isValidProvider, SUPPORTED_PROVIDERS, getDefaultModel } from "./providers.js";
import type { ProviderName } from "./providers.js";
import { runChat } from "./commands/chat.js";
import { demoGuardrails, demoWorkflow, demoGraph, demoObservability } from "./commands/demo.js";
import { startRepl } from "./repl.js";
import { color, bold, maskKey } from "./format.js";

const VERSION = "0.5.0";

const HELP = `
${bold("GaussFlow CLI")} — AI Agent Framework

${bold("Usage:")}
  gaussflow "<prompt>"                         Direct prompt with streaming
  gaussflow chat [--provider <name>] [...]     Interactive REPL
  gaussflow run "<prompt>" [--provider <name>] Single-shot execution
  gaussflow config set <provider> <api-key>    Save API key
  gaussflow config set-provider <name>         Set default provider
  gaussflow config set-model <name>            Set default model
  gaussflow config list                        List API keys
  gaussflow config show                        Show full config
  gaussflow config delete <provider>           Delete API key
  gaussflow demo <type> [--provider <name>]    Feature demos

${bold("Commands:")}
  chat        Start interactive REPL chat session
  run         Single-shot prompt execution
  config      Manage API keys and defaults in ~/.gaussflowrc
  demo        Run feature demos (guardrails, workflow, graph, observability)

${bold("Options:")}
  --provider  AI provider (${SUPPORTED_PROVIDERS.join(", ")})
  --model     Model ID override (e.g. gpt-4o-mini, claude-sonnet-4-20250514)
  --api-key   API key (overrides config file and env vars)
  --yolo      Skip confirmations for tool execution (bash, file writes)
  --help      Show this help
  --version   Show version

${bold("Environment Variables:")}
  OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY,
  GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY

${bold("Examples:")}
  gaussflow "What is the capital of France?"
  gaussflow chat --provider openai --api-key sk-...
  gaussflow run "What is the capital of France?" --provider anthropic
  gaussflow config set openai sk-...
  gaussflow demo guardrails --provider openai
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
      yolo: { type: "boolean" },
    },
    strict: false,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.version) {
    console.log(`gaussflow v${VERSION}`);
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
      return handleChat(values as Record<string, string | boolean | undefined>);

    case "run":
      return handleRun(
        positionals.slice(1).join(" "),
        values as Record<string, string | boolean | undefined>,
      );

    case "demo":
      return handleDemo(
        positionals[1],
        values as Record<string, string | undefined>,
      );

    default:
      // Treat unknown command as a direct prompt (like claude code / opencode)
      return handleRun(
        [command, ...positionals.slice(1)].join(" "),
        values as Record<string, string | boolean | undefined>,
      );
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
        console.error(color("red", "Usage: gaussflow config set <provider> <api-key>"));
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
        console.log(color("dim", "No API keys configured. Use: gaussflow config set <provider> <key>"));
        return;
      }
      console.log(bold("\nConfigured API keys:"));
      for (const [provider, key] of entries) {
        console.log(`  ${provider}: ${color("dim", maskKey(key))}`);
      }
      console.log();
      break;
    }

    case "delete": {
      const provider = args[1];
      if (!provider) {
        console.error(color("red", "Usage: gaussflow config delete <provider>"));
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

    case "set-provider": {
      const name = args[1];
      if (!name) {
        console.error(color("red", "Usage: gaussflow config set-provider <name>"));
        process.exitCode = 1;
        return;
      }
      if (!isValidProvider(name)) {
        console.error(color("red", `Unknown provider: ${name}`));
        console.log(color("dim", `Available: ${SUPPORTED_PROVIDERS.join(", ")}`));
        process.exitCode = 1;
        return;
      }
      setDefaultProvider(name);
      console.log(color("green", `✓ Default provider set to ${name}`));
      break;
    }

    case "set-model": {
      const name = args[1];
      if (!name) {
        console.error(color("red", "Usage: gaussflow config set-model <name>"));
        process.exitCode = 1;
        return;
      }
      setDefaultModel(name);
      console.log(color("green", `✓ Default model set to ${name}`));
      break;
    }

    case "show": {
      const config = loadConfig();
      const entries = Object.entries(config.keys);
      console.log(bold("\nConfiguration (~/.gaussflowrc):"));
      if (entries.length === 0) {
        console.log(color("dim", "  No API keys configured."));
      } else {
        console.log(bold("  API Keys:"));
        for (const [provider, key] of entries) {
          console.log(`    ${provider}: ${color("dim", maskKey(key))}`);
        }
      }
      console.log(`  Default provider: ${config.defaultProvider ?? color("dim", "(not set)")}`);
      console.log(`  Default model: ${config.defaultModel ?? color("dim", "(not set)")}`);
      console.log();
      break;
    }

    default:
      console.error(color("red", "Usage: gaussflow config [set|set-provider|set-model|list|show|delete]"));
      process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat (REPL)
// ─────────────────────────────────────────────────────────────────────────────

async function handleChat(opts: Record<string, string | boolean | undefined>): Promise<void> {
  const { provider, model, apiKey } = await resolveProviderAndModel(opts as Record<string, string | undefined>);
  const languageModel = await createModel(provider, apiKey, model);
  await startRepl(languageModel, provider, apiKey, model, !!opts.yolo);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run (single-shot)
// ─────────────────────────────────────────────────────────────────────────────

async function handleRun(
  prompt: string,
  opts: Record<string, string | boolean | undefined>,
): Promise<void> {
  if (!prompt.trim()) {
    console.error(color("red", 'Usage: gaussflow run "<prompt>" --provider <name>'));
    process.exitCode = 1;
    return;
  }
  const { provider, model, apiKey } = await resolveProviderAndModel(opts as Record<string, string | undefined>);
  const languageModel = await createModel(provider, apiKey, model);
  await runChat(prompt, languageModel, !!opts.yolo);
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
    console.error(color("red", `Usage: gaussflow demo <${DEMO_TYPES.join("|")}> --provider <name>`));
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
  const providerName = opts.provider ?? getDefaultProvider() ?? "openai";

  if (!isValidProvider(providerName)) {
    console.error(color("red", `Unknown provider: ${providerName}`));
    console.log(color("dim", `Available: ${SUPPORTED_PROVIDERS.join(", ")}`));
    process.exit(1);
  }

  const apiKey = resolveApiKey(providerName, opts["api-key"]);
  if (!apiKey) {
    console.error(color("red", `No API key for provider "${providerName}".`));
    console.log(color("dim", "Set one with:"));
    console.log(color("dim", `  gaussflow config set ${providerName} <your-api-key>`));
    console.log(color("dim", `  --api-key <your-api-key>`));
    console.log(color("dim", `  Or set ${envVarName(providerName)} environment variable`));
    process.exit(1);
  }

  const configProvider = getDefaultProvider();
  const configModel =
    !opts.model && providerName === configProvider
      ? getDefaultModelFromConfig()
      : undefined;

  return {
    provider: providerName,
    model: opts.model ?? configModel,
    apiKey,
  };
}

main().catch((err) => {
  console.error(color("red", `\n✗ Fatal error: ${err instanceof Error ? err.message : String(err)}\n`));
  process.exitCode = 1;
});
