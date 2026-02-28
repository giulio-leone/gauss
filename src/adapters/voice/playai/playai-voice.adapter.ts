// =============================================================================
// PlayAIVoiceAdapter — TTS via PlayAI REST API
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface PlayAIVoiceOptions {
  apiKey: string;
  userId?: string;
  voiceId?: string;
  baseUrl?: string;
}

/**
 * Adapter that uses PlayAI REST API for text-to-speech.
 * STT is not supported by PlayAI — `listen()` throws an error.
 */
export class PlayAIVoiceAdapter implements VoicePort {
  private readonly apiKey: string;
  private readonly userId: string | undefined;
  private readonly voiceId: string;
  private readonly baseUrl: string;
  private listeners: VoiceEventListener[] = [];

  constructor(options: PlayAIVoiceOptions) {
    this.apiKey = options.apiKey;
    this.userId = options.userId;
    this.voiceId =
      options.voiceId ?? "s3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d3571/original/manifest.json";
    this.baseUrl = options.baseUrl ?? "https://api.play.ai/api/v1";
  }

  async speak(text: string, config?: VoiceConfig): Promise<Uint8Array> {
    const response = await fetch(`${this.baseUrl}/tts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(this.userId ? { "X-USER-ID": this.userId } : {}),
      },
      body: JSON.stringify({
        text,
        voice: config?.model ?? this.voiceId,
        output_format: "mp3",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`PlayAI TTS failed: ${response.status} ${err}`);
    }

    this.emit({ type: "speaking", text });
    const buffer = await response.arrayBuffer();
    const audio = new Uint8Array(buffer);
    this.emit({ type: "audio", data: audio });
    return audio;
  }

  async listen(
    _audio: Uint8Array,
    _config?: VoiceConfig,
  ): Promise<string> {
    throw new Error("PlayAI does not support STT. Use a dedicated STT adapter.");
  }

  async connect(_config?: VoiceConfig): Promise<void> {
    this.emit({ type: "connected" });
  }

  async disconnect(): Promise<void> {
    this.emit({ type: "disconnected" });
  }

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
