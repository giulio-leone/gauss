import { describe, it, expect, vi } from "vitest";
import { TeamBuilder, team, Team } from "../team-builder.js";
import type { AgentNode } from "../agent-node.js";
import type { SharedContext } from "../shared-context.js";

function mockAgent(id: string, response: string): AgentNode {
  return {
    id,
    execute: vi.fn(async (_input: string, _ctx: SharedContext) => response),
  } as unknown as AgentNode;
}

describe("TeamBuilder", () => {
  it("builds a team with coordinator and specialists", () => {
    const coord = mockAgent("coord", "synthesized");
    const spec1 = mockAgent("s1", "answer1");
    const spec2 = mockAgent("s2", "answer2");

    const t = team()
      .id("test-team")
      .coordinator(coord, "coord")
      .specialist(spec1, { id: "s1", specialties: ["math"] })
      .specialist(spec2, { id: "s2", specialties: ["code"] })
      .strategy("broadcast")
      .build();

    expect(t).toBeInstanceOf(Team);
    expect(t.id).toBe("test-team");
    expect(t.members).toHaveLength(3);
    expect(t.strategy).toBe("broadcast");
  });

  it("throws without coordinator", () => {
    const spec = mockAgent("s1", "x");
    expect(() => team().specialist(spec).build()).toThrow("coordinator");
  });

  it("throws without specialist", () => {
    const coord = mockAgent("c", "x");
    expect(() => team().coordinator(coord).build()).toThrow("specialist");
  });
});

describe("Team.run — round-robin", () => {
  it("runs specialists sequentially, then coordinator synthesizes", async () => {
    const coord = mockAgent("coord", "final-answer");
    const s1 = mockAgent("s1", "response-1");
    const s2 = mockAgent("s2", "response-2");

    const t = team()
      .coordinator(coord, "coord")
      .specialist(s1, { id: "s1" })
      .specialist(s2, { id: "s2" })
      .strategy("round-robin")
      .build();

    const result = await t.run("What is 2+2?");

    expect(result.finalAnswer).toBe("final-answer");
    expect(result.strategy).toBe("round-robin");
    // 2 specialists + 1 coordinator = 3 rounds
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].memberId).toBe("s1");
    expect(result.rounds[1].memberId).toBe("s2");
    expect(result.rounds[2].memberId).toBe("coord");
  });
});

describe("Team.run — broadcast", () => {
  it("runs specialists in parallel, then coordinator synthesizes", async () => {
    const coord = mockAgent("coord", "broadcast-result");
    const s1 = mockAgent("s1", "parallel-1");
    const s2 = mockAgent("s2", "parallel-2");

    const t = team()
      .coordinator(coord, "coord")
      .specialist(s1, { id: "s1" })
      .specialist(s2, { id: "s2" })
      .strategy("broadcast")
      .build();

    const result = await t.run("Analyze this");

    expect(result.finalAnswer).toBe("broadcast-result");
    expect(result.rounds).toHaveLength(3);
    // Both specialists ran
    const specRounds = result.rounds.filter((r) => r.role === "specialist");
    expect(specRounds).toHaveLength(2);
  });
});

describe("Team.run — delegate", () => {
  it("coordinator picks a specialist, that specialist handles the task", async () => {
    const coord = mockAgent("coord", "s2");
    const s1 = mockAgent("s1", "s1-output");
    const s2 = mockAgent("s2", "s2-output");

    const t = team()
      .coordinator(coord, "coord")
      .specialist(s1, { id: "s1", specialties: ["math"] })
      .specialist(s2, { id: "s2", specialties: ["code"] })
      .strategy("delegate")
      .build();

    const result = await t.run("Write a function");

    expect(result.finalAnswer).toBe("s2-output");
    expect(result.rounds).toHaveLength(2); // coord decision + s2 execution
    expect(result.rounds[0].memberId).toBe("coord");
    expect(result.rounds[1].memberId).toBe("s2");
  });
});

describe("Team.run — consensus", () => {
  it("runs all specialists then coordinator evaluates consensus", async () => {
    const coord = mockAgent("coord", "consensus-answer");
    const s1 = mockAgent("s1", "yes");
    const s2 = mockAgent("s2", "yes");
    const s3 = mockAgent("s3", "no");

    const t = team()
      .coordinator(coord, "coord")
      .specialist(s1, { id: "s1" })
      .specialist(s2, { id: "s2" })
      .specialist(s3, { id: "s3" })
      .strategy("consensus")
      .consensusThreshold(0.66)
      .build();

    const result = await t.run("Should we proceed?");

    expect(result.finalAnswer).toBe("consensus-answer");
    expect(result.rounds).toHaveLength(4); // 3 specialists + 1 coordinator
  });
});

describe("team() factory", () => {
  it("returns a TeamBuilder", () => {
    expect(team()).toBeInstanceOf(TeamBuilder);
  });
});
