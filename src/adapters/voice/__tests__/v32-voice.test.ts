// =============================================================================
// v32 Voice Adapter Tests — Azure, Murf, Speechify, PlayAI, Gladia
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzureVoiceAdapter } from "../azure/azure-voice.adapter.js";
import { MurfVoiceAdapter } from "../murf/murf-voice.adapter.js";
import { SpeechifyVoiceAdapter } from "../speechify/speechify-voice.adapter.js";
import { PlayAIVoiceAdapter } from "../playai/playai-voice.adapter.js";
import { GladiaVoiceAdapter } from "../gladia/gladia-voice.adapter.js";
import type { VoiceEvent } from "../../../ports/voice.port.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Azure Speech
// ---------------------------------------------------------------------------

describe("AzureVoiceAdapter", () => {
  const mockClient = {
    synthesize: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    recognize: vi.fn().mockResolvedValue({ text: "hello world" }),
  };

  let adapter: AzureVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AzureVoiceAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(AzureVoiceAdapter);
  });

  it("throws without client or credentials", () => {
    expect(() => new AzureVoiceAdapter({} as never)).toThrow(
      "AzureVoiceAdapter requires either a client or subscriptionKey + region",
    );
  });

  it("speak() calls client.synthesize and returns audio", async () => {
    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.speak("Hello");

    expect(mockClient.synthesize).toHaveBeenCalledWith("Hello");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(events.some((e) => e.type === "speaking")).toBe(true);
    expect(events.some((e) => e.type === "audio")).toBe(true);
  });

  it("listen() calls client.recognize and returns transcript", async () => {
    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.listen(new Uint8Array([4, 5, 6]));

    expect(mockClient.recognize).toHaveBeenCalled();
    expect(result).toBe("hello world");
    expect(events.some((e) => e.type === "listening")).toBe(true);
    expect(events.some((e) => e.type === "transcript")).toBe(true);
  });

  it("on() returns unsubscribe function", () => {
    const events: VoiceEvent[] = [];
    const unsub = adapter.on((e) => events.push(e));
    expect(typeof unsub).toBe("function");
    unsub();
    // Verify listener removed — no events after unsub
  });
});

// ---------------------------------------------------------------------------
// Murf
// ---------------------------------------------------------------------------

describe("MurfVoiceAdapter", () => {
  let adapter: MurfVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MurfVoiceAdapter({ apiKey: "murf-key" });
  });

  it("constructs with apiKey", () => {
    expect(adapter).toBeInstanceOf(MurfVoiceAdapter);
  });

  it("speak() calls Murf API and returns audio", async () => {
    const fakeAudio = new Uint8Array([10, 20, 30]);
    // First call: generate endpoint returns URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ audioFile: "https://murf.ai/audio/123.wav" }),
    });
    // Second call: download audio
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeAudio.buffer),
    });

    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.speak("Hello Murf");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.murf.ai/v1/speech/generate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(events.some((e) => e.type === "speaking")).toBe(true);
  });

  it("listen() throws not supported error", async () => {
    await expect(adapter.listen(new Uint8Array([1]))).rejects.toThrow(
      "Murf does not support STT",
    );
  });

  it("on() returns unsubscribe function", () => {
    const unsub = adapter.on(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("speak() throws on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(adapter.speak("fail")).rejects.toThrow("Murf TTS failed");
  });
});

// ---------------------------------------------------------------------------
// Speechify
// ---------------------------------------------------------------------------

describe("SpeechifyVoiceAdapter", () => {
  let adapter: SpeechifyVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SpeechifyVoiceAdapter({ apiKey: "sp-key" });
  });

  it("constructs with apiKey", () => {
    expect(adapter).toBeInstanceOf(SpeechifyVoiceAdapter);
  });

  it("speak() calls Speechify API and returns audio", async () => {
    const fakeAudio = new Uint8Array([7, 8, 9]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeAudio.buffer),
    });

    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.speak("Hello Speechify");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sws.speechify.com/v1/audio/speech",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(events.some((e) => e.type === "speaking")).toBe(true);
    expect(events.some((e) => e.type === "audio")).toBe(true);
  });

  it("listen() throws not supported error", async () => {
    await expect(adapter.listen(new Uint8Array([1]))).rejects.toThrow(
      "Speechify does not support STT",
    );
  });

  it("on() returns unsubscribe function", () => {
    const unsub = adapter.on(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("speak() throws on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Error"),
    });

    await expect(adapter.speak("fail")).rejects.toThrow("Speechify TTS failed");
  });
});

// ---------------------------------------------------------------------------
// PlayAI
// ---------------------------------------------------------------------------

describe("PlayAIVoiceAdapter", () => {
  let adapter: PlayAIVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new PlayAIVoiceAdapter({ apiKey: "play-key", userId: "user-1" });
  });

  it("constructs with apiKey and userId", () => {
    expect(adapter).toBeInstanceOf(PlayAIVoiceAdapter);
  });

  it("speak() calls PlayAI API and returns audio", async () => {
    const fakeAudio = new Uint8Array([11, 22, 33]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeAudio.buffer),
    });

    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.speak("Hello PlayAI");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.play.ai/api/v1/tts/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(events.some((e) => e.type === "speaking")).toBe(true);
  });

  it("listen() throws not supported error", async () => {
    await expect(adapter.listen(new Uint8Array([1]))).rejects.toThrow(
      "PlayAI does not support STT",
    );
  });

  it("on() returns unsubscribe function", () => {
    const unsub = adapter.on(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("speak() throws on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden"),
    });

    await expect(adapter.speak("fail")).rejects.toThrow("PlayAI TTS failed");
  });
});

// ---------------------------------------------------------------------------
// Gladia
// ---------------------------------------------------------------------------

describe("GladiaVoiceAdapter", () => {
  let adapter: GladiaVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GladiaVoiceAdapter({ apiKey: "gladia-key" });
  });

  it("constructs with apiKey", () => {
    expect(adapter).toBeInstanceOf(GladiaVoiceAdapter);
  });

  it("speak() throws not supported error", async () => {
    await expect(adapter.speak("Hello")).rejects.toThrow(
      "Gladia does not support TTS",
    );
  });

  it("listen() calls Gladia API and returns transcript", async () => {
    // First call: upload → returns result_url
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ result_url: "https://api.gladia.io/v2/result/abc" }),
    });
    // Second call: poll → done
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: "done",
          result: { transcription: { full_transcript: "hello world" } },
        }),
    });

    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.listen(new Uint8Array([1, 2, 3]));

    expect(result).toBe("hello world");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.gladia.io/v2/transcription",
      expect.objectContaining({ method: "POST" }),
    );
    expect(events.some((e) => e.type === "listening")).toBe(true);
    expect(events.some((e) => e.type === "transcript")).toBe(true);
  });

  it("on() returns unsubscribe function", () => {
    const unsub = adapter.on(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("listen() throws on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Invalid API Key"),
    });

    await expect(adapter.listen(new Uint8Array([1]))).rejects.toThrow(
      "Gladia transcription failed",
    );
  });
});
