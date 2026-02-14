import { describe, expect, it } from "vitest";

import { InMemoryAdapter } from "../../adapters/memory/in-memory.adapter.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import type { PluginSetupContext } from "../../ports/plugin.port.js";
import { AgentCardPlugin } from "../agent-card.plugin.js";

function createSetupContext(fs: VirtualFilesystem): PluginSetupContext {
  return {
    sessionId: "session-agent-card",
    agentName: "ReleasePlanner",
    config: {
      instructions: "Plan releases with deterministic milestones.",
      maxSteps: 24,
    },
    filesystem: fs,
    memory: new InMemoryAdapter(),
    toolNames: ["ls", "write_todos", "a2a:call"],
    on: () => () => {
      // no-op
    },
  };
}

describe("AgentCardPlugin", () => {
  it("auto-generates agents.md and skills.md when no manual files exist", async () => {
    const fs = new VirtualFilesystem();
    const plugin = new AgentCardPlugin();

    plugin.setup(createSetupContext(fs));
    const snapshot = await plugin.getAgentCard();

    expect(snapshot.source.agents).toBe("auto");
    expect(snapshot.source.skills).toBe("auto");
    expect(snapshot.agentsMd).toContain("# Agent Card");
    expect(snapshot.agentsMd).toContain("ReleasePlanner");
    expect(snapshot.agentsMd).toContain("`a2a:call`");
    expect(snapshot.skillsMd).toContain("# Skills Card");
    expect(snapshot.skillsMd).toContain("`write_todos`");
  });

  it("prioritizes manual files over override and auto generation", async () => {
    const fs = new VirtualFilesystem();
    await fs.write("agents.md", "# Manual Agent Card", "persistent");
    await fs.write("skills.md", "# Manual Skills Card", "persistent");

    const plugin = new AgentCardPlugin({
      overrides: {
        agents: "# Override Agent Card",
        skills: "# Override Skills Card",
      },
    });

    plugin.setup(createSetupContext(fs));
    const snapshot = await plugin.getAgentCard();

    expect(snapshot.source.agents).toBe("manual");
    expect(snapshot.source.skills).toBe("manual");
    expect(snapshot.agentsMd).toBe("# Manual Agent Card");
    expect(snapshot.skillsMd).toBe("# Manual Skills Card");
  });

  it("merges programmatic overrides when manual files are missing", async () => {
    const fs = new VirtualFilesystem();
    const plugin = new AgentCardPlugin({
      overrides: {
        agents: {
          summary: "Custom summary from production config.",
          tools: ["release:ship", "release:rollback"],
        },
        skills: {
          summary: "Custom skill summary.",
          skills: ["risk-analysis", "deployment-verification"],
        },
      },
    });

    plugin.setup(createSetupContext(fs));
    const snapshot = await plugin.getAgentCard();

    expect(snapshot.source.agents).toBe("override");
    expect(snapshot.source.skills).toBe("override");
    expect(snapshot.agentsMd).toContain("Custom summary from production config.");
    expect(snapshot.agentsMd).toContain("`release:ship`");
    expect(snapshot.skillsMd).toContain("Custom skill summary.");
    expect(snapshot.skillsMd).toContain("`risk-analysis`");
  });
});
