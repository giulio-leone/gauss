// =============================================================================
// SpeechifyVoiceAdapter — TTS via Speechify REST API
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface SpeechifyVoiceOptions {
  apiKey: string;
  voiceId?: string;
  baseUrl?: string;
}

/**
 * Adapter that uses Speechify REST API for text-to-speech.
 * STT is not supported by Speechify — `listen()` throws an error.
 */
export class SpeechifyVoiceAdapter implements VoicePort {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly baseUrl: string;
  private listeners: VoiceEventListener[] = [];

  constructor(options: SpeechifyVoiceOptions) {
    this.apiKey = options.apiKey;
    this.voiceId = options.voiceId ?? "george";
    this.baseUrl = options.baseUrl ?? "https://api.sws.speechify.com";
  }

  async speak(text: string, _config?: VoiceConfig): Promise<Uint8Array> {
    const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        input: text,
        voice_id: this.voiceId,
        audio_format: "mp3",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Speechify TTS failed: ${response.status} ${err}`);
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
    throw new Error("Speechify does not support STT. Use a dedicated STT adapter.");
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
