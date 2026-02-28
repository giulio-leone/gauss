// =============================================================================
// GoogleVoiceAdapter — Google Cloud Speech-to-Text + Text-to-Speech
// =============================================================================
//
// Usage:
//   import { GoogleVoiceAdapter } from "./google-voice.adapter.js";
//
//   // Option A: pass config (clients created lazily)
//   const voice = new GoogleVoiceAdapter({
//     projectId: "my-project",
//     keyFilename: "/path/to/service-account.json",
//   });
//
//   // Option B: pass pre-configured clients
//   import { TextToSpeechClient } from "@google-cloud/text-to-speech";
//   import { SpeechClient } from "@google-cloud/speech";
//   const voice = new GoogleVoiceAdapter({
//     ttsClient: new TextToSpeechClient(),
//     sttClient: new SpeechClient(),
//   });
//
//   const audio = await voice.speak("Hello world");
//   const text  = await voice.listen(audioBuffer);

import type {
  VoicePort,
  VoiceConfig,
  VoiceEventListener,
  VoiceEvent,
} from "../../../ports/voice.port.js";

/** Options accepted by {@link GoogleVoiceAdapter}. */
export interface GoogleVoiceOptions {
  /** Pre-configured Google Cloud TTS client. */
  ttsClient?: unknown;
  /** Pre-configured Google Cloud STT client. */
  sttClient?: unknown;
  /** Google Cloud project ID — used when clients are not provided. */
  projectId?: string;
  /** Path to a service-account key file. */
  keyFilename?: string;
  /** TTS voice name (default: `en-US-Neural2-F`). */
  ttsVoice?: string;
  /** TTS audio encoding (default: `MP3`). */
  ttsEncoding?: string;
  /** Default language code (default: `en-US`). */
  language?: string;
}

export class GoogleVoiceAdapter implements VoicePort {
  private readonly options: GoogleVoiceOptions;
  private listeners: VoiceEventListener[] = [];
  private connected = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ttsClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sttClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private streamingRecognize: any;

  constructor(options: GoogleVoiceOptions) {
    if (!options.ttsClient && !options.sttClient && !options.projectId) {
      throw new Error(
        "GoogleVoiceAdapter requires either pre-configured clients or a projectId",
      );
    }
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Lazy SDK resolution
  // ---------------------------------------------------------------------------

  private async getTtsClient(): Promise<any> {
    if (this.ttsClient) return this.ttsClient;
    if (this.options.ttsClient) {
      this.ttsClient = this.options.ttsClient;
      return this.ttsClient;
    }
    const mod = await import("@google-cloud/text-to-speech");
    const TtsClient = mod.TextToSpeechClient ?? (mod as any).default?.TextToSpeechClient;
    if (!TtsClient) throw new Error("Unable to resolve TextToSpeechClient from @google-cloud/text-to-speech");
    this.ttsClient = new TtsClient({
      projectId: this.options.projectId,
      keyFilename: this.options.keyFilename,
    });
    return this.ttsClient;
  }

  private async getSttClient(): Promise<any> {
    if (this.sttClient) return this.sttClient;
    if (this.options.sttClient) {
      this.sttClient = this.options.sttClient;
      return this.sttClient;
    }
    const mod = await import("@google-cloud/speech");
    const SpeechClient = mod.SpeechClient ?? (mod as any).default?.SpeechClient;
    if (!SpeechClient) throw new Error("Unable to resolve SpeechClient from @google-cloud/speech");
    this.sttClient = new SpeechClient({
      projectId: this.options.projectId,
      keyFilename: this.options.keyFilename,
    });
    return this.sttClient;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — TTS
  // ---------------------------------------------------------------------------

  async speak(text: string, config?: VoiceConfig): Promise<Uint8Array> {
    const client = await this.getTtsClient();
    const language = config?.language ?? this.options.language ?? "en-US";
    const voiceName = config?.model ?? this.options.ttsVoice ?? "en-US-Neural2-F";

    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: language,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding: this.options.ttsEncoding ?? "MP3",
        sampleRateHertz: config?.sampleRate,
      },
    });

    const audioContent = response.audioContent;
    if (!audioContent) throw new Error("Google TTS returned no audio content");

    const audio =
      audioContent instanceof Uint8Array
        ? audioContent
        : new Uint8Array(
            typeof audioContent === "string"
              ? Buffer.from(audioContent, "base64")
              : audioContent,
          );

    this.emit({ type: "speaking", text });
    this.emit({ type: "audio", data: audio });
    return audio;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — STT
  // ---------------------------------------------------------------------------

  async listen(audio: Uint8Array, config?: VoiceConfig): Promise<string> {
    this.emit({ type: "listening" });
    const client = await this.getSttClient();
    const language = config?.language ?? this.options.language ?? "en-US";
    const sampleRate = config?.sampleRate ?? 16_000;

    const [response] = await client.recognize({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: sampleRate,
        languageCode: language,
        model: config?.model ?? "default",
      },
      audio: { content: Buffer.from(audio).toString("base64") },
    });

    const transcript =
      response.results
        ?.map((r: any) => r.alternatives?.[0]?.transcript ?? "")
        .join(" ")
        .trim() ?? "";

    this.emit({ type: "transcript", text: transcript, isFinal: true });
    return transcript;
  }

  // ---------------------------------------------------------------------------
  // VoicePort — Streaming
  // ---------------------------------------------------------------------------

  async connect(config?: VoiceConfig): Promise<void> {
    const client = await this.getSttClient();
    const language = config?.language ?? this.options.language ?? "en-US";
    const sampleRate = config?.sampleRate ?? 16_000;

    this.streamingRecognize = client.streamingRecognize({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: sampleRate,
        languageCode: language,
      },
      interimResults: true,
    });

    this.streamingRecognize.on("data", (data: any) => {
      const result = data.results?.[0];
      if (result?.alternatives?.[0]?.transcript) {
        this.emit({
          type: "transcript",
          text: result.alternatives[0].transcript,
          isFinal: result.isFinal ?? false,
        });
      }
    });

    this.streamingRecognize.on("error", (err: Error) => {
      this.emit({ type: "error", error: err });
    });

    this.streamingRecognize.on("end", () => {
      this.connected = false;
      this.emit({ type: "disconnected" });
    });

    this.connected = true;
    this.emit({ type: "connected" });
  }

  async disconnect(): Promise<void> {
    if (this.streamingRecognize) {
      this.streamingRecognize.end();
      this.streamingRecognize = undefined;
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
