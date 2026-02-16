#!/usr/bin/env node
// =============================================================================
// GaussFlow CLI — Main entry point
// =============================================================================

import { parseArgs } from "node:util";
import { setKey, deleteKey, listKeys, resolveApiKey, envVarName, setDefaultProvider, setDefaultModel, getDefaultProvider, getDefaultModelFromConfig, loadConfig } from "./config.js";
import { createModel, isValidProvider, SUPPORTED_PROVIDERS, getDefaultModel } from "./providers.js";
import type { ProviderName } from "./providers.js";
// Heavy modules (DeepAgent, plugins, graph) are lazy-loaded inside handlers
import { color, bold, maskKey } from "./format.js";

const VERSION = "1.1.0";

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
  gaussflow usage                              Show token usage and cost estimate
  gaussflow demo <type> [--provider <name>]    Feature demos
  gaussflow graph <config.json> [--format]     Visualize agent graph
  gaussflow dev <config.json> [--provider]     Hot-reload dev mode
  gaussflow plugin <subcommand>                Plugin management

${bold("Commands:")}
  chat        Start interactive REPL chat session
  run         Single-shot prompt execution
  config      Manage API keys and defaults in ~/.gaussflowrc
  usage       Show token usage and estimated cost
  demo        Run feature demos (guardrails, workflow, graph, observability)
  graph       Visualize an agent graph from a JSON config file
  dev         Hot-reload dev mode with interactive REPL
  plugin      Manage plugins (search, install, uninstall, list)

${bold("Options:")}
  --provider  AI provider (${SUPPORTED_PROVIDERS.join(", ")})
  --model     Model ID override (e.g. gpt-4o-mini, claude-sonnet-4-20250514)
  --api-key   API key (overrides config file and env vars)
  --format    Output format for graph command (ascii, mermaid)
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
  gaussflow graph agent-graph.json --format mermaid
  gaussflow dev agent-config.json --provider openai
  gaussflow plugin search "code review"
  gaussflow plugin install my-plugin
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      "api-key": { type: "string", short: "k" },
      format: { type: "string", short: "f" },
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

    case "usage":
      return handleUsage();

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

    case "graph":
      return handleGraph(
        positionals[1],
        values as Record<string, string | boolean | undefined>,
      );

    case "dev":
      return handleDev(
        positionals[1],
        values as Record<string, string | boolean | undefined>,
      );

    case "plugin":
      return handlePlugin(positionals.slice(1));

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
// Usage
// ─────────────────────────────────────────────────────────────────────────────

async function handleUsage(): Promise<void> {
  const { readFileSync, existsSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const usagePath = join(homedir(), ".gaussflow", "usage.ndjson");

  if (!existsSync(usagePath)) {
    console.log(color("dim", "No usage data found. Usage is recorded after each CLI session."));
    return;
  }

  let records: Array<{ inputTokens: number; outputTokens: number; model: string; provider: string; timestamp: number }>;
  try {
    const data = readFileSync(usagePath, "utf-8");
    const lines = data.split('\n').filter(l => l.trim());
    records = lines.map(l => JSON.parse(l));
  } catch {
    console.error(color("red", "Failed to parse usage data."));
    process.exitCode = 1;
    return;
  }

  if (records.length === 0) {
    console.log(color("dim", "No usage records found."));
    return;
  }

  // Aggregate by model
  const byModel = new Map<string, { inputTokens: number; outputTokens: number }>();
  let totalInput = 0;
  let totalOutput = 0;

  for (const r of records) {
    totalInput += r.inputTokens;
    totalOutput += r.outputTokens;
    const existing = byModel.get(r.model) ?? { inputTokens: 0, outputTokens: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    byModel.set(r.model, existing);
  }

  const { DefaultCostTrackerAdapter } = await import("../adapters/cost-tracker/index.js");
  const tracker = new DefaultCostTrackerAdapter({ silent: true });
  for (const r of records) tracker.recordUsage(r);
  const estimate = tracker.getEstimate();

  console.log(bold("\nToken Usage Summary"));
  console.log(`  Total input tokens:  ${color("cyan", totalInput.toLocaleString())}`);
  console.log(`  Total output tokens: ${color("cyan", totalOutput.toLocaleString())}`);
  console.log(`  Estimated cost:      ${color("green", `$${estimate.totalCost.toFixed(4)}`)}`);
  console.log();

  if (estimate.breakdown.length > 0) {
    console.log(bold("  Breakdown by model:"));
    for (const b of estimate.breakdown) {
      console.log(`    ${b.model}: ${b.inputTokens.toLocaleString()} in / ${b.outputTokens.toLocaleString()} out → ${color("green", `$${b.cost.toFixed(4)}`)}`);
    }
    console.log();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat (REPL)
// ─────────────────────────────────────────────────────────────────────────────

async function handleChat(opts: Record<string, string | boolean | undefined>): Promise<void> {
  const { provider, model, apiKey } = await resolveProviderAndModel(opts as Record<string, string | undefined>);
  const languageModel = await createModel(provider, apiKey, model);
  const { startRepl } = await import("./repl.js");
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
  const { runChat } = await import("./commands/chat.js");
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
  const { demoGuardrails, demoWorkflow, demoGraph, demoObservability } = await import("./commands/demo.js");

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
// Graph
// ─────────────────────────────────────────────────────────────────────────────

async function handleGraph(
  configPath: string | undefined,
  opts: Record<string, string | boolean | undefined>,
): Promise<void> {
  if (!configPath) {
    console.error(color("red", "Usage: gaussflow graph <config.json> [--format ascii|mermaid]"));
    process.exitCode = 1;
    return;
  }
  const format = (opts.format === "mermaid" ? "mermaid" : "ascii") as "ascii" | "mermaid";
  const { graphCommand } = await import("./commands/graph.js");
  await graphCommand(configPath, format);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dev
// ─────────────────────────────────────────────────────────────────────────────

async function handleDev(
  configPath: string | undefined,
  opts: Record<string, string | boolean | undefined>,
): Promise<void> {
  if (!configPath) {
    console.error(color("red", "Usage: gaussflow dev <config.json> [--provider <name>]"));
    process.exitCode = 1;
    return;
  }
  const { provider, apiKey } = await resolveProviderAndModel(opts as Record<string, string | undefined>);
  const { devCommand } = await import("./commands/dev.js");
  await devCommand(configPath, provider, apiKey, (p, k, m) => createModel(p as ProviderName, k, m));
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

async function handlePlugin(args: string[]): Promise<void> {
  const subcommand = args[0];
  const { pluginSearch, pluginInstall, pluginUninstall, pluginList } = await import("./commands/plugin.js");

  switch (subcommand) {
    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error(color("red", "Usage: gaussflow plugin search <query>"));
        process.exitCode = 1;
        return;
      }
      return pluginSearch(query);
    }
    case "install": {
      const name = args[1];
      if (!name) {
        console.error(color("red", "Usage: gaussflow plugin install <name>"));
        process.exitCode = 1;
        return;
      }
      return pluginInstall(name);
    }
    case "uninstall": {
      const name = args[1];
      if (!name) {
        console.error(color("red", "Usage: gaussflow plugin uninstall <name>"));
        process.exitCode = 1;
        return;
      }
      return pluginUninstall(name);
    }
    case "list":
      return pluginList();
    default:
      console.error(color("red", "Usage: gaussflow plugin <search|install|uninstall|list>"));
      process.exitCode = 1;
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
