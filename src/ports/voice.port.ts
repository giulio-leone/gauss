// =============================================================================
// VoicePort — Abstract voice (STT, TTS) contract
// =============================================================================

export interface VoiceConfig {
  sampleRate?: number;
  language?: string;
  model?: string;
}

export type VoiceEvent =
  | { type: "speaking"; text: string }
  | { type: "listening" }
  | { type: "transcript"; text: string; isFinal: boolean }
  | { type: "audio"; data: Uint8Array }
  | { type: "error"; error: Error }
  | { type: "connected" }
  | { type: "disconnected" };

export type VoiceEventListener = (event: VoiceEvent) => void;

export interface VoicePort {
  /** Convert text to speech audio */
  speak(text: string, config?: VoiceConfig): Promise<Uint8Array>;

  /** Convert audio to text (STT) */
  listen(audio: Uint8Array, config?: VoiceConfig): Promise<string>;

  /** Open a real-time streaming connection */
  connect(config?: VoiceConfig): Promise<void>;

  /** Close the streaming connection */
  disconnect(): Promise<void>;

  /** Register event listener */
  on(listener: VoiceEventListener): () => void;
}
