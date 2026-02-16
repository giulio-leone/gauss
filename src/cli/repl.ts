// =============================================================================
// CLI REPL — Interactive agentic chat mode
// =============================================================================

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { LanguageModel } from "ai";
import { createModel, getDefaultModel, isValidProvider, SUPPORTED_PROVIDERS } from "./providers.js";
import type { ProviderName } from "./providers.js";
import { resolveApiKey, listKeys, ENV_MAP, getMcpServers, addMcpServer, removeMcpServer, loadHistory, appendHistory } from "./config.js";
import { color, bold, createSpinner, formatDuration, maskKey, formatMarkdown } from "./format.js";
import { readFile } from "./commands/files.js";
import { runBash } from "./commands/bash.js";
import { persistUsage } from "./persist-usage.js";
import { DefaultCostTrackerAdapter } from "../adapters/cost-tracker/index.js";
import type { McpServerConfig } from "../ports/mcp.port.js";

const MAX_HISTORY = 200;

const DEFAULT_SYSTEM_PROMPT =
  "You are GaussFlow, an AI coding assistant. You can read files, write files, search code, list directories, and execute bash commands. Use these tools to help the user accomplish their tasks. Be concise and direct.";

export async function startRepl(
  initialModel: LanguageModel,
  providerName: ProviderName,
  apiKey: string,
  modelId?: string,
  yolo?: boolean,
): Promise<void> {
  const SLASH_COMMANDS = [
    "/help", "/exit", "/quit", "/clear", "/model", "/provider",
    "/info", "/settings", "/system", "/yolo", "/read", "/bash",
    "/history", "/clear-history", "/mcp",
  ];
  const MCP_SUBCOMMANDS = ["add", "list", "remove", "connect", "disconnect"];

  function completer(line: string): [string[], string] {
    if (line.startsWith("/mcp ")) {
      const rest = line.slice(5);
      const hits = MCP_SUBCOMMANDS.filter((s) => s.startsWith(rest)).map((s) => `/mcp ${s}`);
      return [hits.length ? hits : [], line];
    }
    if (line.startsWith("/provider ")) {
      const rest = line.slice(10);
      const hits = (SUPPORTED_PROVIDERS as readonly string[])
        .filter((p) => p.startsWith(rest))
        .map((p) => `/provider ${p}`);
      return [hits.length ? hits : [], line];
    }
    if (line.startsWith("/")) {
      const hits = SLASH_COMMANDS.filter((c) => c.startsWith(line));
      return [hits.length ? hits : SLASH_COMMANDS, line];
    }
    return [[], line];
  }

  const savedHistory = loadHistory();
  const rl = createInterface({
    input: stdin,
    output: stdout,
    completer,
  } as Parameters<typeof createInterface>[0]);

  // Load persistent history into readline
  if (Array.isArray((rl as unknown as { history: string[] }).history)) {
    (rl as unknown as { history: string[] }).history = [...savedHistory].reverse();
  }
  let currentModel = initialModel;
  let currentProvider = providerName;
  let currentModelId = modelId ?? getDefaultModel(providerName);
  let currentApiKey = apiKey;
  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  let yoloMode = yolo ?? false;
  const sessionCostTracker = new DefaultCostTrackerAdapter();

  // Serialize tool confirmations to avoid concurrent readline conflicts
  let confirmLock = Promise.resolve<void>();

  const { AiSdkMcpAdapter } = await import("../adapters/mcp/ai-sdk-mcp.adapter.js");
  const mcpAdapter = new AiSdkMcpAdapter();

  // Auto-connect saved MCP servers
  const savedServers = getMcpServers();
  for (const server of savedServers) {
    try {
      await mcpAdapter.connect(server);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(color("yellow", `  ⚠ Failed to connect MCP server "${server.name}": ${msg}`));
    }
  }

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  console.log(bold(color("cyan", "\n  ╔══════════════════════════════════════╗")));
  console.log(bold(color("cyan", "  ║       🤖 GaussFlow Interactive       ║")));
  console.log(bold(color("cyan", "  ╚══════════════════════════════════════╝")));
  console.log(color("dim", `  Provider: ${currentProvider} | Model: ${currentModelId}`));
  console.log(color("dim", "  Tools: readFile, writeFile, bash, listFiles, searchFiles"));
  {
    let mcpToolCount = 0;
    try {
      const mcpDefs = await mcpAdapter.discoverTools();
      mcpToolCount = Object.keys(mcpDefs).length;
    } catch {
      // MCP discovery may fail
    }
    if (savedServers.length > 0) {
      console.log(color("dim", `  MCP Servers: ${savedServers.length} configured${mcpToolCount > 0 ? ` (${mcpToolCount} tools)` : ""}`));
    }
  }
  console.log(color("dim", "  Type /help for commands, /exit to quit\n"));

  function promptText(): string {
    const yoloTag = yoloMode ? color("red", "[YOLO]") : "";
    return color("green", `gaussflow:${currentProvider}${yoloTag}> `);
  }

  try {
    while (true) {
      const input = await rl.question(promptText());
      const trimmed = input.trim();
      if (!trimmed) continue;

      // ! shortcut for bash
      if (trimmed.startsWith("!")) {
        const cmd = trimmed.slice(1).trim();
        if (cmd) await handleBash(cmd);
        continue;
      }

      if (trimmed.startsWith("/")) {
        const handled = await handleSlashCommand(trimmed);
        if (handled === "exit") break;
        continue;
      }

      appendHistory(trimmed);
      await chat(trimmed);
    }
  } catch (err: unknown) {
    const isEof =
      err instanceof Error &&
      (err.message.includes("readline was closed") ||
        (err as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE");
    if (!isEof) throw err;
    console.log(color("dim", "\nGoodbye! 👋\n"));
  } finally {
    await persistUsage(sessionCostTracker).catch(() => {});
    await mcpAdapter.closeAll();
    rl.close();
  }


  async function confirmAction(description: string): Promise<boolean> {
    const previous = confirmLock;
    let release!: () => void;
    confirmLock = new Promise<void>((r) => { release = r; });
    await previous;

    const { createInterface: createConfirmRl } = await import("node:readline/promises");
    const confirmRl = createConfirmRl({ input: stdin, output: stdout });
    try {
      const answer = await confirmRl.question(color("yellow", `  ⚠ ${description} — Execute? (y/n) `));
      return answer.toLowerCase().startsWith("y");
    } finally {
      confirmRl.close();
      stdin.resume();
      release();
    }
  }

  async function handleBash(command: string): Promise<void> {
    if (!yoloMode) {
      const ok = await confirmAction(`Run: ${command}`);
      if (!ok) {
        console.log(color("dim", "  Cancelled.\n"));
        return;
      }
    }
    const result = runBash(command);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(color("red", result.stderr));
    if (result.exitCode !== 0) {
      console.log(color("red", `  Exit code: ${result.exitCode}\n`));
    }
  }

  async function chat(prompt: string): Promise<void> {
    history.push({ role: "user", content: prompt });

    const { tool: aiTool } = await import("ai");
    const { z } = await import("zod");
    const { DeepAgent } = await import("../agent/deep-agent.js");
    const { createCliTools } = await import("./tools.js");

    const tools = createCliTools({
      yolo: yoloMode,
      confirm: confirmAction,
    });

    // Discover MCP tools and merge as regular tools (avoids dispose() closing shared adapter)
    try {
      const mcpDefs = await mcpAdapter.discoverTools();
      for (const [name, def] of Object.entries(mcpDefs)) {
        tools[`mcp:${name}`] = aiTool({
          description: def.description,
          parameters: z.object({}).passthrough(),
          execute: async (args: unknown) => {
            const result = await mcpAdapter.executeTool(name, args);
            if (result.isError) throw new Error(result.content[0]?.text ?? "MCP tool error");
            return result.content.map((c) => c.text ?? "").join("\n");
          },
        });
      }
    } catch {
      // MCP discovery may fail if no servers connected — continue without MCP tools
    }

    const agent = DeepAgent.create({
      model: currentModel,
      instructions: systemPrompt,
      maxSteps: 30,
    })
      .withTools(tools)
      .withCostTracker(sessionCostTracker)
      .build();

    const startTime = Date.now();
    const spinner = createSpinner("Thinking");

    try {
      const stream = await agent.stream({
        messages: history as Array<{ role: string; content: unknown }>,
      });

      let response = "";
      let firstChunk = true;
      for await (const part of stream.fullStream) {
        switch (part.type) {
          case "text-delta":
            if (firstChunk) {
              spinner.stop();
              process.stdout.write(color("cyan", "\n🤖 "));
              firstChunk = false;
            }
            process.stdout.write(part.text);
            response += part.text;
            break;
          case "tool-input-start":
            if (firstChunk) {
              spinner.stop();
              firstChunk = false;
            }
            process.stdout.write(color("magenta", `\n  🔧 ${part.toolName} `));
            break;
          case "tool-input-delta":
            process.stdout.write(color("dim", part.delta.length > 200 ? part.delta.slice(0, 200) + "…" : part.delta));
            break;
          case "tool-input-end":
            process.stdout.write("\n");
            break;
          case "tool-result":
            {
              const raw = (part as Record<string, unknown>).output ?? (part as Record<string, unknown>).result;
              const summary = typeof raw === "string" ? raw : JSON.stringify(raw);
              process.stdout.write(color("dim", `  ↳ ${summary.length > 500 ? summary.slice(0, 500) + "…" : summary}\n`));
            }
            break;
          case "tool-error":
            process.stdout.write(color("red", `  ✗ Tool error (${(part as Record<string, unknown>).toolName}): ${(part as Record<string, unknown>).error}\n`));
            break;
          case "error":
            if (firstChunk) { spinner.stop(); firstChunk = false; }
            process.stdout.write(color("red", `\n  ✗ Stream error: ${(part as Record<string, unknown>).error}\n`));
            break;
          default:
            break;
        }
      }

      if (response) {
        history.push({ role: "assistant", content: response });
        if (history.length > MAX_HISTORY) {
          history.splice(0, history.length - MAX_HISTORY);
        }
      }

      const elapsed = formatDuration(Date.now() - startTime);
      process.stdout.write(color("dim", `\n\n  ⏱ ${elapsed} | ${history.length} messages\n\n`));
    } catch (err) {
      history.pop();
      const msg = err instanceof Error ? err.message : String(err);
      console.error(color("red", `\n✗ Error: ${msg}\n`));
    } finally {
      spinner.stop();
      await agent.dispose();
    }
  }

  async function handleSlashCommand(cmd: string): Promise<string | void> {
    const parts = cmd.split(/\s+/);
    const command = parts[0]!.toLowerCase();

    switch (command) {
      case "/exit":
      case "/quit":
        console.log(color("dim", "Goodbye! 👋\n"));
        return "exit";

      case "/help":
        console.log(bold("\nCommands:"));
        console.log("  /help              Show this help");
        console.log("  /exit              Exit the REPL");
        console.log("  /clear             Clear the screen");
        console.log("");
        console.log(bold("  Provider & Model:"));
        console.log("  /model <name>      Switch model (e.g. /model gpt-4o-mini)");
        console.log("  /provider <name>   Switch provider");
        console.log("  /info              Show current provider and model");
        console.log("  /settings          Show all current settings");
        console.log("");
        console.log(bold("  Agent:"));
        console.log("  /system [prompt]   Get/set system prompt");
        console.log("  /yolo [on|off]     Toggle YOLO mode (skip confirmations)");
        console.log("");
        console.log(bold("  File & Shell:"));
        console.log("  /read <file>       Read and display a file");
        console.log("  /bash <cmd>        Execute a bash command");
        console.log("  !<cmd>             Shortcut for /bash");
        console.log("");
        console.log(bold("  History:"));
        console.log("  /history           Show conversation history");
        console.log("  /clear-history     Clear conversation history");
        console.log("");
        console.log(bold("  MCP Servers:"));
        console.log("  /mcp add <name> <cmd> [args]  Add a stdio MCP server");
        console.log("  /mcp list                     List configured MCP servers");
        console.log("  /mcp remove <name>            Remove an MCP server");
        console.log("  /mcp connect <name>           Connect a configured server");
        console.log("  /mcp disconnect <name>        Disconnect a server\n");
        break;

      case "/clear":
        process.stdout.write("\x1Bc");
        break;

      case "/info":
        console.log(color("cyan", `  Provider: ${currentProvider}`));
        console.log(color("cyan", `  Model: ${currentModelId}`));
        console.log(color("cyan", `  YOLO: ${yoloMode ? "ON" : "OFF"}\n`));
        break;

      case "/model": {
        const newModel = parts[1];
        if (!newModel) {
          console.log(color("yellow", `  Current model: ${currentModelId}`));
          break;
        }
        try {
          currentModel = await createModel(currentProvider, currentApiKey, newModel);
          currentModelId = newModel;
          console.log(color("green", `  ✓ Switched to model: ${currentModelId}\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ Failed to switch model: ${msg}\n`));
        }
        break;
      }

      case "/provider": {
        const newProvider = parts[1];
        if (!newProvider) {
          console.log(color("yellow", `  Current provider: ${currentProvider}`));
          console.log(color("dim", `  Available: ${SUPPORTED_PROVIDERS.join(", ")}\n`));
          break;
        }
        if (!isValidProvider(newProvider)) {
          console.log(color("red", `  ✗ Unknown provider: ${newProvider}`));
          console.log(color("dim", `  Available: ${SUPPORTED_PROVIDERS.join(", ")}\n`));
          break;
        }
        const key = resolveApiKey(newProvider);
        if (!key) {
          console.log(color("red", `  ✗ No API key for ${newProvider}. Use: gaussflow config set ${newProvider} <key>\n`));
          break;
        }
        try {
          const newModelId = getDefaultModel(newProvider);
          currentModel = await createModel(newProvider, key, newModelId);
          currentProvider = newProvider;
          currentModelId = newModelId;
          currentApiKey = key;
          console.log(color("green", `  ✓ Switched to ${currentProvider} (${currentModelId})\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ Failed to switch provider: ${msg}\n`));
        }
        break;
      }

      case "/system": {
        const newPrompt = parts.slice(1).join(" ").trim();
        if (!newPrompt) {
          console.log(bold("\n  System prompt:"));
          console.log(color("dim", `  ${systemPrompt}\n`));
        } else {
          systemPrompt = newPrompt;
          console.log(color("green", "  ✓ System prompt updated.\n"));
        }
        break;
      }

      case "/yolo": {
        const arg = parts[1]?.toLowerCase();
        if (arg === "on") {
          yoloMode = true;
        } else if (arg === "off") {
          yoloMode = false;
        } else {
          yoloMode = !yoloMode;
        }
        const status = yoloMode
          ? color("red", "ON — commands execute without confirmation")
          : color("green", "OFF — will ask before executing");
        console.log(`  YOLO mode: ${status}\n`);
        break;
      }

      case "/read": {
        const filePath = parts[1];
        if (!filePath) {
          console.log(color("red", "  Usage: /read <file-path>\n"));
          break;
        }
        try {
          const result = readFile(filePath);
          console.log(color("dim", `\n  ─── ${result.path} ───`));
          console.log(result.content);
          console.log(color("dim", "  ─────────\n"));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ ${msg}\n`));
        }
        break;
      }

      case "/bash": {
        const bashCmd = parts.slice(1).join(" ").trim();
        if (!bashCmd) {
          console.log(color("red", "  Usage: /bash <command>\n"));
          break;
        }
        await handleBash(bashCmd);
        break;
      }

      case "/settings":
        console.log(bold("\n  ⚙ Settings:"));
        console.log(`  Provider:  ${color("cyan", currentProvider)}`);
        console.log(`  Model:     ${color("cyan", currentModelId)}`);
        console.log(`  API Key:   ${color("dim", maskKey(currentApiKey))}`);
        console.log(`  YOLO:      ${yoloMode ? color("red", "ON") : color("green", "OFF")}`);
        console.log(`  System:    ${color("dim", systemPrompt.length > 60 ? systemPrompt.slice(0, 57) + "..." : systemPrompt)}`);
        console.log(`  Available: ${color("dim", SUPPORTED_PROVIDERS.join(", "))}`);
        {
          const allKeys = listKeys();
          const providerSources: Array<{ name: string; source: string }> = [];
          for (const p of SUPPORTED_PROVIDERS) {
            if (allKeys[p]) {
              providerSources.push({ name: p, source: "config" });
            } else if (ENV_MAP[p] && process.env[ENV_MAP[p]!]) {
              providerSources.push({ name: p, source: "env" });
            }
          }
          if (providerSources.length > 0) {
            console.log(bold("  Configured providers:"));
            for (const { name, source } of providerSources) {
              const k = allKeys[name] ?? process.env[ENV_MAP[name]!] ?? "";
              const masked = maskKey(k);
              const active = name === currentProvider ? color("green", " (active)") : "";
              const srcLabel = source === "env" ? color("yellow", " [env]") : "";
              console.log(`    ${name}: ${color("dim", masked)}${active}${srcLabel}`);
            }
          }
        }
        console.log();
        break;

      case "/history":
        if (history.length === 0) {
          console.log(color("dim", "  No conversation history.\n"));
        } else {
          console.log(bold("\n  Conversation History:"));
          for (const msg of history) {
            const prefix = msg.role === "user" ? color("green", "  You: ") : color("cyan", "  AI:  ");
            const content = msg.content.length > 80 ? msg.content.slice(0, 77) + "..." : msg.content;
            console.log(`${prefix}${content}`);
          }
          console.log("");
        }
        break;

      case "/clear-history":
        history.length = 0;
        console.log(color("green", "  ✓ Conversation history cleared.\n"));
        break;

      case "/mcp":
        await handleMcpCommand(parts.slice(1));
        break;

      default:
        console.log(color("yellow", `  Unknown command: ${command}. Type /help for available commands.\n`));
    }
  }

  async function handleMcpCommand(args: string[]): Promise<void> {
    const sub = args[0]?.toLowerCase();

    switch (sub) {
      case "add": {
        const name = args[1];
        const command = args[2];
        if (!name || !command) {
          console.log(color("red", "  Usage: /mcp add <name> <command> [args...]\n"));
          break;
        }
        const serverArgs = args.slice(3);
        const config: McpServerConfig = {
          id: name,
          name,
          transport: "stdio",
          command,
          args: serverArgs.length > 0 ? serverArgs : undefined,
        };
        try {
          await mcpAdapter.connect(config);
          addMcpServer(config);
          console.log(color("green", `  ✓ MCP server "${name}" added and connected.\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ Failed to connect: ${msg}\n`));
        }
        break;
      }

      case "list": {
        const servers = await mcpAdapter.listServers();
        if (servers.length === 0) {
          console.log(color("dim", "  No MCP servers configured.\n"));
          break;
        }
        console.log(bold("\n  MCP Servers:"));
        for (const s of servers) {
          const statusColor = s.status === "connected" ? "green" : s.status === "error" ? "red" : "yellow";
          console.log(`    ${s.name} (${s.transport}) — ${color(statusColor, s.status)}`);
        }
        console.log("");
        break;
      }

      case "remove": {
        const name = args[1];
        if (!name) {
          console.log(color("red", "  Usage: /mcp remove <name>\n"));
          break;
        }
        await mcpAdapter.disconnect(name);
        const removed = removeMcpServer(name);
        if (removed) {
          console.log(color("green", `  ✓ MCP server "${name}" removed.\n`));
        } else {
          console.log(color("yellow", `  Server "${name}" not found in config.\n`));
        }
        break;
      }

      case "connect": {
        const name = args[1];
        if (!name) {
          console.log(color("red", "  Usage: /mcp connect <name>\n"));
          break;
        }
        const saved = getMcpServers().find((s) => s.id === name);
        if (!saved) {
          console.log(color("red", `  ✗ Server "${name}" not found in config. Use /mcp add first.\n`));
          break;
        }
        try {
          await mcpAdapter.connect(saved);
          console.log(color("green", `  ✓ Connected to "${name}".\n`));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(color("red", `  ✗ Failed to connect: ${msg}\n`));
        }
        break;
      }

      case "disconnect": {
        const name = args[1];
        if (!name) {
          console.log(color("red", "  Usage: /mcp disconnect <name>\n"));
          break;
        }
        await mcpAdapter.disconnect(name);
        console.log(color("green", `  ✓ Disconnected from "${name}".\n`));
        break;
      }

      default:
        console.log(color("yellow", "  Usage: /mcp <add|list|remove|connect|disconnect>\n"));
    }
  }
}
