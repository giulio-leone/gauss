---
sidebar_position: 4
title: Voice (STT/TTS)
---

# Voice (STT/TTS)

The Voice module provides Speech-to-Text (STT) and Text-to-Speech (TTS) capabilities to enable voice-based interactions with agents. Gauss supports multiple voice providers through a pluggable adapter system.

## VoicePort Interface

The `VoicePort` interface defines the contract for voice operations:

```typescript
interface VoicePort {
  transcribe(audio: AudioBuffer | Stream): Promise<string>;
  speak(text: string): Promise<AudioBuffer | Stream>;
  getLanguage(): string;
  setLanguage(lang: string): void;
}
```

## OpenAI Voice Adapter

The OpenAI Voice Adapter provides STT using Whisper and TTS using OpenAI's voice models.

### Configuration

```typescript
import { OpenAIVoiceAdapter } from 'gauss/providers';

const voiceAdapter = new OpenAIVoiceAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'whisper-1',           // STT model
  voice: 'nova',                 // TTS voice (nova, onyx, alloy, echo, fable, shimmer)
  language: 'en'
});
```

### Speech-to-Text (Whisper)

Transcribe audio files or streams to text:

```typescript
import { readFileSync } from 'fs';

// From file
const audioBuffer = readFileSync('speech.wav');
const transcript = await voiceAdapter.transcribe(audioBuffer);
console.log('Transcribed:', transcript);

// From stream
const { createReadStream } = require('fs');
const audioStream = createReadStream('speech.wav');
const transcript = await voiceAdapter.transcribe(audioStream);
```

### Text-to-Speech

Convert text to audio:

```typescript
const text = 'Hello, I am your AI assistant.';
const audioBuffer = await voiceAdapter.speak(text);

// Save to file
const { writeFileSync } = require('fs');
writeFileSync('output.mp3', audioBuffer);
```

## ElevenLabs Voice Adapter

The ElevenLabs Voice Adapter provides premium TTS with advanced voice synthesis.

### Configuration

```typescript
import { ElevenLabsVoiceAdapter } from 'gauss/providers';

const voiceAdapter = new ElevenLabsVoiceAdapter({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voiceId: 'EXAVITQu4vr4xnSDxMaL',     // Voice ID
  modelId: 'eleven_monolingual_v1',     // Model selection
  stability: 0.5,
  similarityBoost: 0.75
});
```

### Usage

```typescript
// TTS with ElevenLabs
const audioBuffer = await voiceAdapter.speak('Premium voice synthesis');

// Change voice
voiceAdapter.setVoice('nClJR6f1eEfHjrXRPK1M');
const output = await voiceAdapter.speak('Different voice');
```

## Voice Pipeline

Create an end-to-end voice interaction pipeline:

```typescript
import { Agent, VoicePipeline } from 'gauss';
import { OpenAIVoiceAdapter } from 'gauss/providers';

const voiceAdapter = new OpenAIVoiceAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  voice: 'nova'
});

const agent = new Agent({
  model: 'gpt-4',
  instructions: 'You are a helpful assistant.'
});

const voicePipeline = new VoicePipeline()
  .setVoiceAdapter(voiceAdapter)
  .setAgent(agent)
  .enableFeedback(true);  // Enable spoken feedback

// Process voice interaction: Audio → STT → Agent → TTS → Audio
const inputAudio = /* ... */;
const outputAudio = await voicePipeline.process(inputAudio);
```

## Complete Example: Voice-Enabled Chatbot

```typescript
import { Agent, VoicePipeline } from 'gauss';
import { OpenAIVoiceAdapter, OpenAI } from 'gauss/providers';
import { readFileSync, writeFileSync } from 'fs';

// Initialize providers
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const voiceAdapter = new OpenAIVoiceAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  voice: 'shimmer'
});

// Create agent
const agent = new Agent({
  model: 'gpt-4',
  provider: openai,
  instructions: 'You are a friendly customer support agent.',
  tools: [
    {
      name: 'get_order_status',
      description: 'Retrieve customer order status',
      execute: async (orderId) => {
        return `Order #${orderId} is shipped and arriving tomorrow.`;
      }
    }
  ]
});

// Build pipeline
const pipeline = new VoicePipeline()
  .setVoiceAdapter(voiceAdapter)
  .setAgent(agent)
  .setTimeout(30000);

// Process voice request
async function handleCustomerCall(audioFilePath) {
  console.log('Processing customer call...');
  
  const audioBuffer = readFileSync(audioFilePath);
  const transcript = await voiceAdapter.transcribe(audioBuffer);
  console.log('Customer said:', transcript);
  
  // Let agent process
  const response = await agent.respond(transcript);
  console.log('Agent response:', response.text);
  
  // Convert response to speech
  const outputAudio = await voiceAdapter.speak(response.text);
  writeFileSync('response.mp3', outputAudio);
  
  return outputAudio;
}

// Run
handleCustomerCall('customer_call.wav');
```

## Advanced: Custom Voice Adapter

Implement custom voice providers:

```typescript
import { VoicePort } from 'gauss';

class CustomVoiceAdapter implements VoicePort {
  private apiKey: string;
  private language: string = 'en';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: AudioBuffer | Stream): Promise<string> {
    // Implementation: call custom STT service
    const response = await fetch('https://custom-stt-api.com/transcribe', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: audio
    });
    const data = await response.json();
    return data.transcript;
  }

  async speak(text: string): Promise<AudioBuffer | Stream> {
    // Implementation: call custom TTS service
    const response = await fetch('https://custom-tts-api.com/synthesize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ text, language: this.language })
    });
    return await response.arrayBuffer();
  }

  getLanguage(): string {
    return this.language;
  }

  setLanguage(lang: string): void {
    this.language = lang;
  }
}

// Use custom adapter
const customVoice = new CustomVoiceAdapter(process.env.CUSTOM_API_KEY);
const pipeline = new VoicePipeline()
  .setVoiceAdapter(customVoice)
  .setAgent(agent);
```

## Configuration Reference

### OpenAI Voice Adapter Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | required | OpenAI API key |
| `model` | string | `whisper-1` | STT model |
| `voice` | string | `nova` | TTS voice |
| `language` | string | `en` | Language code |
| `temperature` | number | `0` | STT creativity |

### ElevenLabs Adapter Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | string | required | ElevenLabs API key |
| `voiceId` | string | required | Target voice ID |
| `modelId` | string | `eleven_monolingual_v1` | Model version |
| `stability` | number | `0.5` | Voice stability (0-1) |
| `similarityBoost` | number | `0.75` | Similarity boost (0-1) |

## Best Practices

- **Cache Synthesized Speech**: Reuse audio for repeated phrases
- **Handle Latency**: Use streaming for real-time applications
- **Error Handling**: Implement fallbacks for audio processing failures
- **Language Detection**: Auto-detect language from audio when possible
- **Quality Trade-offs**: Balance quality vs. latency for your use case
