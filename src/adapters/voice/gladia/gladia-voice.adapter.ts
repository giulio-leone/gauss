// =============================================================================
// GladiaVoiceAdapter — STT via Gladia REST API
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface GladiaVoiceOptions {
  apiKey: string;
  baseUrl?: string;
  language?: string;
}

/**
 * Adapter that uses Gladia REST API for speech-to-text transcription.
 * TTS is not supported by Gladia — `speak()` throws an error.
 */
export class GladiaVoiceAdapter implements VoicePort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly language: string;
  private listeners: VoiceEventListener[] = [];

  constructor(options: GladiaVoiceOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.gladia.io/v2";
    this.language = options.language ?? "en";
  }

  async speak(
    _text: string,
    _config?: VoiceConfig,
  ): Promise<Uint8Array> {
    throw new Error("Gladia does not support TTS. Use a dedicated TTS adapter.");
  }

  async listen(audio: Uint8Array, config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });

    // Upload audio for transcription
    const formData = new FormData();
    formData.append(
      "audio",
      new Blob([audio], { type: "audio/wav" }),
      "audio.wav",
    );

    const uploadResponse = await fetch(`${this.baseUrl}/transcription`, {
      method: "POST",
      headers: {
        "x-gladia-key": this.apiKey,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const err = await uploadResponse.text();
      throw new Error(`Gladia transcription failed: ${uploadResponse.status} ${err}`);
    }

    const uploadResult = await uploadResponse.json();
    const resultUrl: string = uploadResult.result_url;

    // Poll for result
    const transcript = await this.pollForResult(resultUrl, config);
    this.emit({ type: "transcript", text: transcript, isFinal: true });
    return transcript;
  }

  private async pollForResult(resultUrl: string, _config?: VoiceConfig): Promise<string> {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      const response = await fetch(resultUrl, {
        headers: { "x-gladia-key": this.apiKey },
      });

      if (!response.ok) {
        throw new Error(`Gladia poll failed: ${response.status}`);
      }

      const data = await response.json();
      if (data.status === "done") {
        return data.result?.transcription?.full_transcript ?? "";
      }
      if (data.status === "error") {
        throw new Error(`Gladia transcription error: ${data.error ?? "unknown"}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Gladia transcription timed out");
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
