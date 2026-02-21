// =============================================================================
// serializer.test.ts — Tests for JSON and Markdown serializers
// =============================================================================

import { describe, it, expect } from "vitest";
import { JSONSerializer } from "../../adapters/compiler/json-serializer.js";
import { MarkdownSerializer } from "../../adapters/compiler/markdown-serializer.js";
import type { CompilerOutput } from "../../domain/compiler.schema.js";

const sampleOutput: CompilerOutput = {
  workflow: {
    id: "techcrunch-ai-monitor",
    name: "TechCrunch AI Monitor",
    declaration: {
      name: "TechCrunch AI Monitor",
      description: "Monitors TechCrunch for AI articles and publishes to social media",
      triggers: [{ type: "cron", expression: "every 2h" }],
      steps: [
        { type: "monitor", source: "https://techcrunch.com/ai", description: "Check AI articles", strategy: "adaptive" },
        { type: "filter", criteria: "Only generative AI", minRelevance: 0.7 },
        { type: "transform", action: "Rewrite for LinkedIn", targetChannel: "linkedin" },
        { type: "publish", channels: ["linkedin", "x"] },
      ],
      channels: [{ platform: "linkedin", tone: "professional" }],
      policy: { default: "review", yolo: false },
    },
  },
  skills: [
    {
      id: "monitor-techcrunch",
      platform: "web",
      description: "Monitor TechCrunch AI category",
      preconditions: "URL accessible",
      flow: ["fetch page", "extract articles", "compute fingerprint"],
      notes: ["Adaptive polling", "Uses OneCrawl"],
      isExisting: false,
    },
    {
      id: "publish-linkedin",
      platform: "linkedin",
      description: "Publish to LinkedIn",
      preconditions: "OAuth token valid",
      flow: ["format as article", "publish via API"],
      notes: [],
      maxContentLength: 3000,
      isExisting: true,
    },
  ],
  agents: [
    {
      id: "monitor-agent",
      role: "Monitors web sources for new content",
      skills: ["monitor-techcrunch"],
      trigger: { type: "cron", expression: "every 2h" },
    },
    {
      id: "publisher-agent",
      role: "Delivers content to platforms",
      skills: ["publish-linkedin", "publish-x"],
    },
  ],
  routes: [
    { from: "monitor-agent", to: "filter-agent", event: "content:detected" },
    { from: "filter-agent", to: "content-agent", event: "content:filtered" },
    { from: "content-agent", to: "publisher-agent", event: "content:ready", condition: "policy allows auto-publish" },
  ],
};

describe("JSONSerializer", () => {
  const serializer = new JSONSerializer();

  it("should have format 'json'", () => {
    expect(serializer.format).toBe("json");
  });

  it("should produce valid JSON", () => {
    const json = serializer.serialize(sampleOutput);
    const parsed = JSON.parse(json);
    expect(parsed.workflow.name).toBe("TechCrunch AI Monitor");
    expect(parsed.skills).toHaveLength(2);
    expect(parsed.agents).toHaveLength(2);
    expect(parsed.routes).toHaveLength(3);
  });

  it("should be deterministic", () => {
    const a = serializer.serialize(sampleOutput);
    const b = serializer.serialize(sampleOutput);
    expect(a).toBe(b);
  });
});

describe("MarkdownSerializer", () => {
  const serializer = new MarkdownSerializer();

  it("should have format 'markdown'", () => {
    expect(serializer.format).toBe("markdown");
  });

  it("should contain workflow name as title", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("# TechCrunch AI Monitor");
  });

  it("should contain description", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("Monitors TechCrunch for AI articles");
  });

  it("should list triggers", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("Cron: `every 2h`");
  });

  it("should list skills with their details", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("### monitor-techcrunch");
    expect(md).toContain("### publish-linkedin");
    expect(md).toContain("**Platform:** web");
    expect(md).toContain("**Existing:** Yes (reused)");
    expect(md).toContain("**Existing:** No (new)");
  });

  it("should render skill flow as ordered list", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("1. fetch page");
    expect(md).toContain("1. extract articles");
  });

  it("should list agents", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("### monitor-agent");
    expect(md).toContain("### publisher-agent");
    expect(md).toContain("**Skills:** publish-linkedin, publish-x");
  });

  it("should render A2A routes as table", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("| From | To | Event | Condition |");
    expect(md).toContain("| monitor-agent | filter-agent | `content:detected` | - |");
    expect(md).toContain("policy allows auto-publish");
  });

  it("should show max content length when present", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("**Max Length:** 3000");
  });

  it("should show policy", () => {
    const md = serializer.serialize(sampleOutput);
    expect(md).toContain("**Default Policy:** review");
  });
});
