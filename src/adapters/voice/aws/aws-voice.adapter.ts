// =============================================================================
// AwsVoiceAdapter — TTS via Amazon Polly, STT via Amazon Transcribe
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface AwsVoiceOptions {
  /** Pre-configured Polly client. */
  pollyClient?: unknown;
  /** Pre-configured Transcribe client. */
  transcribeClient?: unknown;
  /** AWS region (required when clients are not provided). */
  region?: string;
  /** AWS credentials (optional — falls back to default credential chain). */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /** Polly voice ID (default: `Joanna`). */
  voiceId?: string;
  /** Polly output format (default: `mp3`). */
  outputFormat?: string;
  /** Transcribe language code (default: `en-US`). */
  language?: string;
}

export class AwsVoiceAdapter implements VoicePort {
  private readonly options: AwsVoiceOptions;
  private listeners: VoiceEventListener[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private polly: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transcribe: any;

  constructor(options: AwsVoiceOptions) {
    if (!options.pollyClient && !options.transcribeClient && !options.region) {
      throw new Error(
        "AwsVoiceAdapter requires either pre-configured clients or a region",
      );
    }
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getPolly(): Promise<any> {
    if (this.polly) return this.polly;
    if (this.options.pollyClient) {
      this.polly = this.options.pollyClient;
      return this.polly;
    }
    // @ts-expect-error — @aws-sdk/client-polly is a peer dependency
    const { PollyClient } = await import("@aws-sdk/client-polly");
    this.polly = new PollyClient({
      region: this.options.region,
      ...(this.options.credentials ? { credentials: this.options.credentials } : {}),
    });
    return this.polly;
  }

  private async getTranscribe(): Promise<any> {
    if (this.transcribe) return this.transcribe;
    if (this.options.transcribeClient) {
      this.transcribe = this.options.transcribeClient;
      return this.transcribe;
    }
    // @ts-expect-error — @aws-sdk/client-transcribe is a peer dependency
    const { TranscribeClient } = await import("@aws-sdk/client-transcribe");
    this.transcribe = new TranscribeClient({
      region: this.options.region,
      ...(this.options.credentials ? { credentials: this.options.credentials } : {}),
    });
    return this.transcribe;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — TTS (Amazon Polly)
  // ---------------------------------------------------------------------------

  async speak(text: string, config?: VoiceConfig): Promise<Uint8Array> {
    const client = await this.getPolly();
    const voiceId = this.options.voiceId ?? "Joanna";
    const outputFormat = this.options.outputFormat ?? "mp3";

    const result = await client.synthesizeSpeech({
      Text: text,
      VoiceId: voiceId,
      OutputFormat: outputFormat,
      ...(config?.language ? { LanguageCode: config.language } : {}),
    });

    const audioStream = result.AudioStream;
    let audio: Uint8Array;
    if (audioStream instanceof Uint8Array) {
      audio = audioStream;
    } else if (typeof audioStream?.transformToByteArray === "function") {
      audio = await audioStream.transformToByteArray();
    } else {
      throw new Error("Polly returned unexpected AudioStream type");
    }

    this.emit({ type: "speaking", text });
    this.emit({ type: "audio", data: audio });
    return audio;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — STT (Amazon Transcribe)
  // ---------------------------------------------------------------------------

  async listen(audio: Uint8Array, config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });
    const client = await this.getTranscribe();
    const language = config?.language ?? this.options.language ?? "en-US";

    const result = await client.startTranscriptionJob({
      Media: { MediaData: Buffer.from(audio).toString("base64") },
      LanguageCode: language,
      MediaFormat: "wav",
    });

    const transcript =
      result?.TranscriptionJob?.Transcript?.TranscriptText ?? "";
    this.emit({ type: "transcript", text: transcript, isFinal: true });
    return transcript;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — Streaming
  // ---------------------------------------------------------------------------

  async connect(_config?: VoiceConfig): Promise<void> {
    this.emit({ type: "connected" });
  }

  async disconnect(): Promise<void> {
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
