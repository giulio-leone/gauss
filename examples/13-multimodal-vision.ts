// =============================================================================
// 13 — Multimodal Vision (image input via message array)
// =============================================================================
//
// Sends an image to a vision-capable model using the message array format.
// The Agent supports multimodal content via the Message interface.
//
// Usage: npx tsx examples/13-multimodal-vision.ts

import { Agent } from "gauss-ts";
import * as fs from "node:fs";

async function main(): Promise<void> {
  const agent = new Agent({
    name: "vision",
    provider: "openai",
    model: "gpt-4o", // Vision-capable model
    instructions: "You analyze images and describe what you see in detail.",
  });

  // Check provider capabilities
  console.log("Provider capabilities:", agent.capabilities);

  // ── Option 1: Image from URL ───────────────────────────────────────
  const urlResult = await agent.run([
    { role: "user", content: "Describe this image: https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg" },
  ]);
  console.log("URL image analysis:", urlResult.text.slice(0, 200), "...\n");

  // ── Option 2: Image from base64 (local file) ──────────────────────
  const imagePath = process.argv[2];
  if (imagePath && fs.existsSync(imagePath)) {
    const base64 = fs.readFileSync(imagePath).toString("base64");
    const mime = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

    const fileResult = await agent.run([
      { role: "user", content: `Analyze this image (base64 ${mime}): data:${mime};base64,${base64.slice(0, 100)}...` },
    ]);
    console.log("Local image analysis:", fileResult.text.slice(0, 200), "...\n");
  } else {
    console.log("Tip: pass an image path as argument for local file analysis.");
    console.log("  npx tsx examples/13-multimodal-vision.ts ./photo.jpg\n");
  }

  agent.destroy();
}

main().catch(console.error);
