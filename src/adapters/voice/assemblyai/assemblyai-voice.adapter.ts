// =============================================================================
// AssemblyAIVoiceAdapter — STT via AssemblyAI SDK (batch + real-time WebSocket)
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface AssemblyAIVoiceOptions {
  /** Pre-configured AssemblyAI client instance. */
  client?: unknown;
  /** API key — used when `client` is not provided. */
  apiKey?: string;
  /** STT model (default: `best`). */
  sttModel?: string;
  /** Default language code. */
  language?: string;
}

export class AssemblyAIVoiceAdapter implements VoicePort {
  private readonly options: AssemblyAIVoiceOptions;
  private listeners: VoiceEventListener[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aaiClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private realtimeTranscriber: any;

  constructor(options: AssemblyAIVoiceOptions) {
    if (!options.client && !options.apiKey) {
      throw new Error("AssemblyAIVoiceAdapter requires either a client or an apiKey");
    }
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getClient(): Promise<any> {
    if (this.aaiClient) return this.aaiClient;
    if (this.options.client) {
      this.aaiClient = this.options.client;
      return this.aaiClient;
    }
    // @ts-expect-error — assemblyai is a peer dependency resolved at runtime
    const sdk = await import("assemblyai");
    const AssemblyAI = sdk.AssemblyAI ?? sdk.default?.AssemblyAI;
    if (!AssemblyAI) throw new Error("Unable to resolve AssemblyAI from assemblyai");
    this.aaiClient = new AssemblyAI({ apiKey: this.options.apiKey! });
    return this.aaiClient;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — TTS (not supported)
  // ---------------------------------------------------------------------------

  async speak(_text: string, _config?: VoiceConfig): Promise<Uint8Array> {
    throw new Error("AssemblyAI does not support TTS");
  }

  // ---------------------------------------------------------------------------
  // VoicePort — STT (batch)
  // ---------------------------------------------------------------------------

  async listen(audio: Uint8Array, config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });
    const client = await this.getClient();
    const language = config?.language ?? this.options.language ?? "en";

    const transcript = await client.transcripts.transcribe({
      audio: Buffer.from(audio),
      language_code: language,
      speech_model: config?.model ?? this.options.sttModel ?? "best",
    });

    const text = transcript.text ?? "";
    this.emit({ type: "transcript", text, isFinal: true });
    return text;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — Streaming (real-time WebSocket STT)
  // ---------------------------------------------------------------------------

  async connect(config?: VoiceConfig): Promise<void> {
    const client = await this.getClient();
    const sampleRate = config?.sampleRate ?? 16_000;

    this.realtimeTranscriber = client.realtime.transcriber({
      sampleRate,
    });

    this.realtimeTranscriber.on("open", () => {
      this.emit({ type: "connected" });
    });

    this.realtimeTranscriber.on("close", () => {
      this.emit({ type: "disconnected" });
    });

    this.realtimeTranscriber.on("transcript", (msg: any) => {
      if (msg.text) {
        this.emit({
          type: "transcript",
          text: msg.text,
          isFinal: msg.message_type === "FinalTranscript",
        });
      }
    });

    this.realtimeTranscriber.on("error", (err: Error) => {
      this.emit({ type: "error", error: err });
    });

    await this.realtimeTranscriber.connect();
  }

  async disconnect(): Promise<void> {
    if (this.realtimeTranscriber) {
      await this.realtimeTranscriber.close();
      this.realtimeTranscriber = undefined;
    }
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
