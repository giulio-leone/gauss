// =============================================================================
// InMemoryVoiceAdapter — Mock voice adapter for testing
// =============================================================================

import type { VoicePort, VoiceConfig, VoiceEvent, VoiceEventListener } from "../../ports/voice.port.js";

export class InMemoryVoiceAdapter implements VoicePort {
  private listeners: VoiceEventListener[] = [];
  private connected = false;
  /** Custom speak handler for testing (returns mock audio) */
  speakHandler: (text: string) => Uint8Array;
  /** Custom listen handler for testing (returns mock transcript) */
  listenHandler: (audio: Uint8Array) => string;

  constructor(opts?: {
    speakHandler?: (text: string) => Uint8Array;
    listenHandler?: (audio: Uint8Array) => string;
  }) {
    this.speakHandler = opts?.speakHandler ?? ((text) => new TextEncoder().encode(text));
    this.listenHandler = opts?.listenHandler ?? (() => "mock transcript");
  }

  async speak(text: string, _config?: VoiceConfig): Promise<Uint8Array> {
    const audio = this.speakHandler(text);
    this.emit({ type: "speaking", text });
    this.emit({ type: "audio", data: audio });
    return audio;
  }

  async listen(audio: Uint8Array, _config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });
    const text = this.listenHandler(audio);
    this.emit({ type: "transcript", text, isFinal: true });
    return text;
  }

  async connect(_config?: VoiceConfig): Promise<void> {
    this.connected = true;
    this.emit({ type: "connected" });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit({ type: "disconnected" });
  }

  on(listener: VoiceEventListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  isConnected(): boolean {
    return this.connected;
  }

  private emit(event: VoiceEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* isolated */ }
    }
  }
}
