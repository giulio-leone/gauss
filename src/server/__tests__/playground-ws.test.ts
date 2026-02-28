import { describe, it, expect } from "vitest";
import { createPlaygroundWSHandler } from "../playground-ws.js";
import type { PlaygroundAgent } from "../playground-api.js";
import type { PlaygroundWSMessage } from "../playground-ws.js";

function makeMockAgent(name: string, response: string): PlaygroundAgent {
  return {
    name,
    invoke: async () => response,
  };
}

function makeMockStreamAgent(name: string, chunks: string[]): PlaygroundAgent {
  return {
    name,
    invoke: async (_prompt, opts) => {
      if (opts?.stream) {
        return (async function* () {
          for (const chunk of chunks) yield chunk;
        })();
      }
      return chunks.join("");
    },
  };
}

describe("PlaygroundWS Handler", () => {
  it("handles run message and returns done", async () => {
    const agents = { bot: makeMockAgent("bot", "Hello!") };
    const handler = createPlaygroundWSHandler({ agents });
    const messages: PlaygroundWSMessage[] = [];
    handler.onMessage(
      JSON.stringify({ type: "run", agent: "bot", prompt: "hi" }),
      (msg) => messages.push(msg),
    );
    // Wait for async
    await new Promise((r) => setTimeout(r, 10));
    expect(messages.some((m) => m.type === "done")).toBe(true);
    const done = messages.find((m) => m.type === "done")!;
    expect(done.text).toBe("Hello!");
  });

  it("handles streaming response", async () => {
    const agents = { bot: makeMockStreamAgent("bot", ["He", "llo", "!"]) };
    const handler = createPlaygroundWSHandler({ agents });
    const messages: PlaygroundWSMessage[] = [];
    handler.onMessage(
      JSON.stringify({ type: "run", agent: "bot", prompt: "hi" }),
      (msg) => messages.push(msg),
    );
    await new Promise((r) => setTimeout(r, 10));
    const tokens = messages.filter((m) => m.type === "token");
    expect(tokens).toHaveLength(3);
    expect(tokens[0].token).toBe("He");
  });

  it("returns error for unknown agent", async () => {
    const handler = createPlaygroundWSHandler({ agents: {} });
    const messages: PlaygroundWSMessage[] = [];
    handler.onMessage(
      JSON.stringify({ type: "run", agent: "missing", prompt: "hi" }),
      (msg) => messages.push(msg),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(messages[0].type).toBe("error");
    expect(messages[0].message).toContain("not found");
  });

  it("returns error for invalid JSON", () => {
    const handler = createPlaygroundWSHandler({ agents: {} });
    const messages: PlaygroundWSMessage[] = [];
    handler.onMessage("not json", (msg) => messages.push(msg));
    expect(messages[0].type).toBe("error");
    expect(messages[0].message).toContain("Invalid JSON");
  });

  it("returns error for unknown message type", () => {
    const handler = createPlaygroundWSHandler({ agents: {} });
    const messages: PlaygroundWSMessage[] = [];
    handler.onMessage(JSON.stringify({ type: "bogus" }), (msg) => messages.push(msg));
    expect(messages[0].type).toBe("error");
    expect(messages[0].message).toContain("Unknown");
  });

  it("onClose cancels active runs", async () => {
    const agents = {
      slow: {
        name: "slow",
        invoke: async () => {
          await new Promise((r) => setTimeout(r, 5000));
          return "done";
        },
      } as PlaygroundAgent,
    };
    const handler = createPlaygroundWSHandler({ agents });
    handler.onMessage(
      JSON.stringify({ type: "run", agent: "slow", prompt: "hi" }),
      () => {},
    );
    await new Promise((r) => setTimeout(r, 5));
    expect(handler.activeRunCount).toBe(1);
    handler.onClose();
    expect(handler.activeRunCount).toBe(0);
  });

  it("limits concurrent runs", async () => {
    const agents = {
      slow: {
        name: "slow",
        invoke: async () => {
          await new Promise((r) => setTimeout(r, 5000));
          return "done";
        },
      } as PlaygroundAgent,
    };
    const handler = createPlaygroundWSHandler({ agents, maxConcurrent: 1 });
    const messages: PlaygroundWSMessage[] = [];
    handler.onMessage(
      JSON.stringify({ type: "run", agent: "slow", prompt: "1" }),
      () => {},
    );
    await new Promise((r) => setTimeout(r, 5));
    handler.onMessage(
      JSON.stringify({ type: "run", agent: "slow", prompt: "2" }),
      (msg) => messages.push(msg),
    );
    await new Promise((r) => setTimeout(r, 5));
    expect(messages[0].type).toBe("error");
    expect(messages[0].message).toContain("concurrent");
    handler.onClose();
  });
});
