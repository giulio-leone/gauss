// =============================================================================
// MurfVoiceAdapter — TTS via Murf AI REST API
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface MurfVoiceOptions {
  apiKey: string;
  voiceId?: string;
  style?: string;
  baseUrl?: string;
}

/**
 * Adapter that uses Murf AI REST API for text-to-speech.
 * STT is not supported by Murf — `listen()` throws an error.
 */
export class MurfVoiceAdapter implements VoicePort {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly style: string;
  private readonly baseUrl: string;
  private listeners: VoiceEventListener[] = [];

  constructor(options: MurfVoiceOptions) {
    this.apiKey = options.apiKey;
    this.voiceId = options.voiceId ?? "en-US-natalie";
    this.style = options.style ?? "Conversational";
    this.baseUrl = options.baseUrl ?? "https://api.murf.ai/v1";
  }

  async speak(text: string, _config?: VoiceConfig): Promise<Uint8Array> {
    const response = await fetch(`${this.baseUrl}/speech/generate`, {
      method: "POST",
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        voiceId: this.voiceId,
        style: this.style,
        text,
        format: "WAV",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Murf TTS failed: ${response.status} ${err}`);
    }

    const json = (await response.json()) as { audioFile?: string; url?: string };
    const audioUrl: string = json.audioFile ?? json.url ?? "";

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Murf audio download failed: ${audioResponse.status}`);
    }

    const buffer = await audioResponse.arrayBuffer();
    const audio = new Uint8Array(buffer);
    this.emit({ type: "speaking", text });
    this.emit({ type: "audio", data: audio });
    return audio;
  }

  async listen(
    _audio: Uint8Array,
    _config?: VoiceConfig,
  ): Promise<string> {
    throw new Error("Murf does not support STT. Use a dedicated STT adapter.");
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
