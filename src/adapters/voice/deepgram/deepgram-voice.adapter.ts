// =============================================================================
// DeepgramVoiceAdapter — STT + TTS via Deepgram SDK
// =============================================================================
//
// Usage:
//   import { DeepgramVoiceAdapter } from "./deepgram-voice.adapter.js";
//
//   // Option A: pass config (client is created lazily)
//   const voice = new DeepgramVoiceAdapter({ apiKey: "dg-..." });
//
//   // Option B: pass a pre-configured Deepgram client
//   import { createClient } from "@deepgram/sdk";
//   const voice = new DeepgramVoiceAdapter({ client: createClient("dg-...") });
//
//   const audio = await voice.speak("Hello world");
//   const text  = await voice.listen(audioBuffer);

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

/** Options accepted by {@link DeepgramVoiceAdapter}. */
export interface DeepgramVoiceOptions {
  /** Pre-configured Deepgram client instance. */
  client?: unknown;
  /** API key — used when `client` is not provided. */
  apiKey?: string;
  /** TTS model (default: `aura-asteria-en`). */
  ttsModel?: string;
  /** STT model (default: `nova-2`). */
  sttModel?: string;
  /** Default language code (e.g. `en`). */
  language?: string;
}

export class DeepgramVoiceAdapter implements VoicePort {
  private readonly options: DeepgramVoiceOptions;
  private listeners: VoiceEventListener[] = [];
  private connected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dgClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private liveConnection: any;

  constructor(options: DeepgramVoiceOptions) {
    if (!options.client && !options.apiKey) {
      throw new Error("DeepgramVoiceAdapter requires either a client or an apiKey");
    }
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getClient(): Promise<any> {
    if (this.dgClient) return this.dgClient;
    if (this.options.client) {
      this.dgClient = this.options.client;
      return this.dgClient;
    }
    const sdk = await import("@deepgram/sdk");
    const createClient = sdk.createClient ?? sdk.default?.createClient;
    if (!createClient) throw new Error("Unable to resolve createClient from @deepgram/sdk");
    this.dgClient = createClient(this.options.apiKey!);
    return this.dgClient;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — TTS
  // ---------------------------------------------------------------------------

  async speak(text: string, config?: VoiceConfig): Promise<Uint8Array> {
    const client = await this.getClient();
    const model = config?.model ?? this.options.ttsModel ?? "aura-asteria-en";

    const response = await client.speak.request({ text }, { model });
    const stream = await response.getStream();
    if (!stream) throw new Error("Deepgram TTS returned no audio stream");

    const chunks: Uint8Array[] = [];
    const reader = (stream as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const audio = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
    }

    this.emit({ type: "speaking", text });
    this.emit({ type: "audio", data: audio });
    return audio;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — STT
  // ---------------------------------------------------------------------------

  async listen(audio: Uint8Array, config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });
    const client = await this.getClient();
    const model = config?.model ?? this.options.sttModel ?? "nova-2";
    const language = config?.language ?? this.options.language ?? "en";

    const { result } = await client.listen.prerecorded.transcribeFile(
      Buffer.from(audio),
      { model, language, smart_format: true },
    );

    const transcript =
      result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    this.emit({ type: "transcript", text: transcript, isFinal: true });
    return transcript;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — Streaming (live transcription via WebSocket)
  // ---------------------------------------------------------------------------

  async connect(config?: VoiceConfig): Promise<void> {
    const client = await this.getClient();
    const model = config?.model ?? this.options.sttModel ?? "nova-2";
    const language = config?.language ?? this.options.language ?? "en";
    const sampleRate = config?.sampleRate ?? 16_000;

    this.liveConnection = client.listen.live({
      model,
      language,
      encoding: "linear16",
      sample_rate: sampleRate,
      smart_format: true,
    });

    this.liveConnection.on("open", () => {
      this.connected = true;
      this.emit({ type: "connected" });
    });

    this.liveConnection.on("close", () => {
      this.connected = false;
      this.emit({ type: "disconnected" });
    });

    this.liveConnection.on("Results", (data: any) => {
      const alt = data?.channel?.alternatives?.[0];
      if (alt?.transcript) {
        this.emit({
          type: "transcript",
          text: alt.transcript,
          isFinal: data.is_final ?? false,
        });
      }
    });

    this.liveConnection.on("error", (err: Error) => {
      this.emit({ type: "error", error: err });
    });
  }

  async disconnect(): Promise<void> {
    if (this.liveConnection) {
      this.liveConnection.requestClose?.();
      this.liveConnection = undefined;
    }
    this.connected = false;
    this.emit({ type: "disconnected" });
  }

  // ---------------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------------

  on(listener: VoiceEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: VoiceEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch { /* isolated */ }
    }
  }
}
