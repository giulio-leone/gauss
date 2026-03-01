// =============================================================================
// 11 — Voice Pipeline (placeholder)
// =============================================================================
//
// ⚠️  Voice/audio support requires a dedicated audio provider integration.
//     This example is a placeholder showing the intended API surface.
//     Voice STT/TTS will be available in a future release.
//
// Usage: npx tsx examples/11-voice-pipeline.ts

import { Agent } from "gauss-ts";

async function main(): Promise<void> {
  console.log("Voice Pipeline — placeholder example\n");
  console.log("Voice/audio support is not yet available in the native SDK.");
  console.log("The intended flow will be:\n");
  console.log("  1. Audio input → STT (speech-to-text)");
  console.log("  2. Text → Agent.run(text)");
  console.log("  3. Agent response → TTS (text-to-speech)");
  console.log("  4. Audio output\n");

  // For now, demonstrate the text-based part of the pipeline
  const agent = new Agent({
    name: "voice-ready",
    instructions: "You are a conversational assistant. Keep answers short and natural.",
    maxSteps: 3,
  });

  const result = await agent.run("What's the weather like today?");
  console.log("Agent (text):", result.text);

  agent.destroy();
}

main().catch(console.error);
