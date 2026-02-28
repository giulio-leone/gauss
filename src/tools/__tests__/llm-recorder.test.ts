import { describe, it, expect, vi, afterEach } from "vitest";
import {
  LLMRecorder,
  LLMReplayer,
  type LLMCallRecord,
} from "../llm-recorder.js";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "Hello from the model!",
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "stop",
  }),
}));

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import * as fs from "node:fs";

const mockModel = { modelId: "test-model" } as any;

describe("LLMRecorder", () => {
  afterEach(() => vi.clearAllMocks());

  it("records a single call", async () => {
    const recorder = new LLMRecorder();
    const { text, record } = await recorder.record({
      model: mockModel,
      prompt: "Say hello",
    });

    expect(text).toBe("Hello from the model!");
    expect(record.id).toBe("call-1");
    expect(record.model).toBe("test-model");
    expect(record.input.prompt).toBe("Say hello");
    expect(record.output.text).toBe("Hello from the model!");
    expect(record.output.usage?.inputTokens).toBe(10);
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records multiple calls with incrementing IDs", async () => {
    const recorder = new LLMRecorder();
    await recorder.record({ model: mockModel, prompt: "First" });
    await recorder.record({ model: mockModel, prompt: "Second" });

    const records = recorder.getRecords();
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe("call-1");
    expect(records[1].id).toBe("call-2");
  });

  it("saves to JSONL format", async () => {
    const recorder = new LLMRecorder({ format: "jsonl" });
    await recorder.record({ model: mockModel, prompt: "Test" });
    await recorder.save("/tmp/test.jsonl");

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/test.jsonl",
      expect.stringContaining('"id":"call-1"'),
      "utf-8"
    );
  });

  it("saves to JSON format", async () => {
    const recorder = new LLMRecorder({ format: "json" });
    await recorder.record({ model: mockModel, prompt: "Test" });
    await recorder.save("/tmp/test.json");

    const written = (fs.writeFileSync as any).mock.calls[0][1] as string;
    const parsed = JSON.parse(written);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe("call-1");
  });

  it("clears records", async () => {
    const recorder = new LLMRecorder();
    await recorder.record({ model: mockModel, prompt: "Test" });
    expect(recorder.getRecords()).toHaveLength(1);
    recorder.clear();
    expect(recorder.getRecords()).toHaveLength(0);
  });
});

describe("LLMReplayer", () => {
  const sampleRecords: LLMCallRecord[] = [
    {
      id: "call-1",
      timestamp: "2025-01-01T00:00:00.000Z",
      model: "gpt-5.2",
      input: { prompt: "Hello" },
      output: { text: "Hi there!" },
      durationMs: 100,
    },
    {
      id: "call-2",
      timestamp: "2025-01-01T00:00:01.000Z",
      model: "gpt-5.2",
      input: { prompt: "How are you?" },
      output: { text: "I am fine." },
      durationMs: 150,
    },
  ];

  it("replays records sequentially", () => {
    const replayer = new LLMReplayer();
    replayer.loadFromRecords(sampleRecords);

    expect(replayer.hasMore()).toBe(true);
    expect(replayer.count).toBe(2);

    const first = replayer.next();
    expect(first.output.text).toBe("Hi there!");

    const second = replayer.next();
    expect(second.output.text).toBe("I am fine.");

    expect(replayer.hasMore()).toBe(false);
  });

  it("throws in strict mode when exhausted", () => {
    const replayer = new LLMReplayer({ strict: true });
    replayer.loadFromRecords(sampleRecords);
    replayer.next();
    replayer.next();
    expect(() => replayer.next()).toThrow("no more records");
  });

  it("returns last record in non-strict mode", () => {
    const replayer = new LLMReplayer({ strict: false });
    replayer.loadFromRecords(sampleRecords);
    replayer.next();
    replayer.next();
    const last = replayer.next();
    expect(last.output.text).toBe("I am fine.");
  });

  it("finds by prompt", () => {
    const replayer = new LLMReplayer();
    replayer.loadFromRecords(sampleRecords);
    const found = replayer.findByPrompt("How are you?");
    expect(found?.output.text).toBe("I am fine.");
    expect(replayer.findByPrompt("nonexistent")).toBeUndefined();
  });

  it("finds by model and prompt", () => {
    const replayer = new LLMReplayer();
    replayer.loadFromRecords(sampleRecords);
    const found = replayer.findByModelAndPrompt("gpt-5.2", "Hello");
    expect(found?.output.text).toBe("Hi there!");
  });

  it("loads from JSONL file", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      sampleRecords.map((r) => JSON.stringify(r)).join("\n") + "\n"
    );
    const replayer = new LLMReplayer();
    replayer.loadFromFile("/tmp/test.jsonl");
    expect(replayer.count).toBe(2);
  });

  it("loads from JSON file", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify(sampleRecords)
    );
    const replayer = new LLMReplayer();
    replayer.loadFromFile("/tmp/test.json");
    expect(replayer.count).toBe(2);
  });

  it("resets replay position", () => {
    const replayer = new LLMReplayer();
    replayer.loadFromRecords(sampleRecords);
    replayer.next();
    replayer.next();
    replayer.reset();
    expect(replayer.hasMore()).toBe(true);
    expect(replayer.next().id).toBe("call-1");
  });
});
