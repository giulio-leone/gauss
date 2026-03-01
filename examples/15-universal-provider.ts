// =============================================================================
// 15 — Universal Provider: all supported providers
// =============================================================================
//
// Shows how to create agents with each supported provider: OpenAI, Anthropic,
// Google, Groq, DeepSeek, and Ollama. Each uses the same Agent API.
//
// Usage: npx tsx examples/15-universal-provider.ts

import { Agent } from "gauss-ai";
import type { AgentConfig } from "gauss-ai";

const prompt = "Say 'Hello from <your model name>' in exactly one sentence.";

// Define provider configurations (only runs if the corresponding API key is set)
const providers: Array<AgentConfig & { envKey: string }> = [
  {
    envKey: "OPENAI_API_KEY",
    name: "openai-agent",
    provider: "openai",
    model: "gpt-4o",
  },
  {
    envKey: "ANTHROPIC_API_KEY",
    name: "anthropic-agent",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
  },
  {
    envKey: "GOOGLE_API_KEY",
    name: "google-agent",
    provider: "google",
    model: "gemini-2.0-flash",
  },
  {
    envKey: "GROQ_API_KEY",
    name: "groq-agent",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
  },
  {
    envKey: "DEEPSEEK_API_KEY",
    name: "deepseek-agent",
    provider: "deepseek",
    model: "deepseek-chat",
  },
  {
    envKey: "", // Ollama needs no key
    name: "ollama-agent",
    provider: "ollama",
    model: "llama3",
    providerOptions: { baseUrl: "http://localhost:11434" },
  },
];

async function main(): Promise<void> {
  console.log("Universal Provider Demo\n");

  for (const { envKey, ...config } of providers) {
    // Skip providers without API keys (except Ollama)
    if (envKey && !process.env[envKey]) {
      console.log(`[${config.provider}] Skipped — ${envKey} not set`);
      continue;
    }

    const agent = new Agent(config);
    try {
      console.log(`[${config.provider}] Capabilities:`, agent.capabilities);
      const result = await agent.run(prompt);
      console.log(`[${config.provider}] ${result.text}`);
      console.log(`  Tokens: ${result.inputTokens} in / ${result.outputTokens} out\n`);
    } catch (err) {
      console.log(`[${config.provider}] Error: ${(err as Error).message}\n`);
    } finally {
      agent.destroy();
    }
  }
}

main().catch(console.error);
