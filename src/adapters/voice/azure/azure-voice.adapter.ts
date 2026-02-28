// =============================================================================
// AzureVoiceAdapter — Azure Cognitive Services Speech SDK (peer dep)
// =============================================================================

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

export interface AzureVoiceOptions {
  /** Pre-configured Azure Speech SDK instance. */
  client?: unknown;
  subscriptionKey?: string;
  region?: string;
  /** TTS voice name (default: `en-US-JennyNeural`). */
  voiceName?: string;
  /** STT language (default: `en-US`). */
  language?: string;
}

/**
 * Adapter that uses Microsoft Azure Cognitive Services Speech SDK for TTS and STT.
 * Requires `microsoft-cognitiveservices-speech-sdk` as a peer dependency.
 */
export class AzureVoiceAdapter implements VoicePort {
  private readonly options: AzureVoiceOptions;
  private listeners: VoiceEventListener[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdkPromise: Promise<any> | undefined;

  constructor(options: AzureVoiceOptions) {
    if (!options.client && (!options.subscriptionKey || !options.region)) {
      throw new Error("AzureVoiceAdapter requires either a client or subscriptionKey + region");
    }
    this.options = options;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getSdk(): Promise<any> {
    if (this.sdkPromise) return this.sdkPromise;
    // @ts-expect-error — microsoft-cognitiveservices-speech-sdk is a peer dependency
    this.sdkPromise = import("microsoft-cognitiveservices-speech-sdk");
    return this.sdkPromise;
  }

  async speak(text: string, config?: VoiceConfig): Promise<Uint8Array> {
    if (this.options.client) {
      // Delegate to pre-configured client with synthesize method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = this.options.client as any;
      const result = await client.synthesize(text);
      const audio = new Uint8Array(result.audioData ?? result);
      this.emit({ type: "speaking", text });
      this.emit({ type: "audio", data: audio });
      return audio;
    }

    const sdk = await this.getSdk();
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.options.subscriptionKey!,
      this.options.region!,
    );
    speechConfig.speechSynthesisVoiceName =
      config?.model ?? this.options.voiceName ?? "en-US-JennyNeural";

    return new Promise<Uint8Array>((resolve, reject) => {
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
      synthesizer.speakTextAsync(
        text,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result: any) => {
          synthesizer.close();
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audio = new Uint8Array(result.audioData);
            this.emit({ type: "speaking", text });
            this.emit({ type: "audio", data: audio });
            resolve(audio);
          } else {
            reject(new Error(`Azure TTS failed: ${result.errorDetails}`));
          }
        },
        (error: string) => {
          synthesizer.close();
          reject(new Error(`Azure TTS error: ${error}`));
        },
      );
    });
  }

  async listen(audio: Uint8Array, config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });

    if (this.options.client) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = this.options.client as any;
      const result = await client.recognize(audio);
      const text = result.text ?? result;
      this.emit({ type: "transcript", text, isFinal: true });
      return text;
    }

    const sdk = await this.getSdk();
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      this.options.subscriptionKey!,
      this.options.region!,
    );
    speechConfig.speechRecognitionLanguage =
      config?.language ?? this.options.language ?? "en-US";

    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(audio.buffer);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    return new Promise<string>((resolve, reject) => {
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      recognizer.recognizeOnceAsync(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result: any) => {
          recognizer.close();
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            this.emit({ type: "transcript", text: result.text, isFinal: true });
            resolve(result.text);
          } else {
            reject(new Error(`Azure STT failed: ${result.errorDetails ?? "no speech recognized"}`));
          }
        },
        (error: string) => {
          recognizer.close();
          reject(new Error(`Azure STT error: ${error}`));
        },
      );
    });
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
