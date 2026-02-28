// =============================================================================
// v33 Voice Adapter Tests — AssemblyAI, AWS (Polly + Transcribe)
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssemblyAIVoiceAdapter } from "../assemblyai/assemblyai-voice.adapter.js";
import { AwsVoiceAdapter } from "../aws/aws-voice.adapter.js";
import type { VoiceEvent } from "../../../ports/voice.port.js";

// ---------------------------------------------------------------------------
// AssemblyAI
// ---------------------------------------------------------------------------

describe("AssemblyAIVoiceAdapter", () => {
  const mockClient = {
    transcripts: {
      transcribe: vi.fn().mockResolvedValue({ text: "hello world" }),
    },
    realtime: {
      transcriber: vi.fn().mockReturnValue({
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };

  let adapter: AssemblyAIVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AssemblyAIVoiceAdapter({ client: mockClient });
  });

  it("accepts a pre-configured client", () => {
    expect(adapter).toBeInstanceOf(AssemblyAIVoiceAdapter);
  });

  it("throws without client or apiKey", () => {
    expect(() => new AssemblyAIVoiceAdapter({} as never)).toThrow(
      "AssemblyAIVoiceAdapter requires either a client or an apiKey",
    );
  });

  it("speak() throws not supported error", async () => {
    await expect(adapter.speak("Hello")).rejects.toThrow(
      "AssemblyAI does not support TTS",
    );
  });

  it("listen() calls client.transcripts.transcribe and returns text", async () => {
    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.listen(new Uint8Array([1, 2, 3]));

    expect(mockClient.transcripts.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ language_code: "en" }),
    );
    expect(result).toBe("hello world");
    expect(events.some((e) => e.type === "listening")).toBe(true);
    expect(events.some((e) => e.type === "transcript")).toBe(true);
  });

  it("on() returns unsubscribe function", () => {
    const events: VoiceEvent[] = [];
    const unsub = adapter.on((e) => events.push(e));
    expect(typeof unsub).toBe("function");
    unsub();
  });
});

// ---------------------------------------------------------------------------
// AWS (Polly + Transcribe)
// ---------------------------------------------------------------------------

describe("AwsVoiceAdapter", () => {
  const mockPollyClient = {
    synthesizeSpeech: vi.fn().mockResolvedValue({
      AudioStream: new Uint8Array([1, 2, 3]),
    }),
  };

  const mockTranscribeClient = {
    startTranscriptionJob: vi.fn().mockResolvedValue({
      TranscriptionJob: {
        Transcript: { TranscriptText: "hello from aws" },
      },
    }),
  };

  let adapter: AwsVoiceAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AwsVoiceAdapter({
      pollyClient: mockPollyClient,
      transcribeClient: mockTranscribeClient,
    });
  });

  it("accepts pre-configured clients", () => {
    expect(adapter).toBeInstanceOf(AwsVoiceAdapter);
  });

  it("throws without clients or region", () => {
    expect(() => new AwsVoiceAdapter({} as never)).toThrow(
      "AwsVoiceAdapter requires either pre-configured clients or a region",
    );
  });

  it("speak() calls Polly synthesizeSpeech and returns audio", async () => {
    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.speak("Hello AWS");

    expect(mockPollyClient.synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ Text: "Hello AWS", VoiceId: "Joanna" }),
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(events.some((e) => e.type === "speaking")).toBe(true);
    expect(events.some((e) => e.type === "audio")).toBe(true);
  });

  it("listen() calls Transcribe and returns transcript", async () => {
    const events: VoiceEvent[] = [];
    adapter.on((e) => events.push(e));

    const result = await adapter.listen(new Uint8Array([4, 5, 6]));

    expect(mockTranscribeClient.startTranscriptionJob).toHaveBeenCalledWith(
      expect.objectContaining({ LanguageCode: "en-US" }),
    );
    expect(result).toBe("hello from aws");
    expect(events.some((e) => e.type === "listening")).toBe(true);
    expect(events.some((e) => e.type === "transcript")).toBe(true);
  });

  it("on() returns unsubscribe function", () => {
    const unsub = adapter.on(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
