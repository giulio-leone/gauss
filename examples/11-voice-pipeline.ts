/**
 * Voice Pipeline Example
 * =====================
 * Demonstrates voice I/O using OpenAI's speech capabilities.
 * Combines STT (speech-to-text) and TTS (text-to-speech) with an agent.
 */

import { agent, VoicePipeline } from 'gauss'
import { openai } from 'gauss/providers'

async function main() {
  // Initialize provider with voice capabilities
  const provider = openai({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
  })

  // Create conversational agent
  const voiceAgent = agent({
    name: 'VoiceAssistant',
    role: 'Conversational voice assistant',
    provider,
    system: 'You are a helpful voice assistant. Keep responses concise and natural.',
  })

  // Create voice pipeline
  // Input: microphone → STT → Agent → TTS → speaker
  const voicePipeline = VoicePipeline({
    agent: voiceAgent,
    stt: {
      provider: 'openai',
      language: 'en',
    },
    tts: {
      provider: 'openai',
      voice: 'alloy',
      speed: 1.0,
    },
  })

  console.log('🎤 Voice Pipeline Active')
  console.log('Say something and listen for the response...\n')

  try {
    // Example: Process audio file instead of live mic
    const audioFile = process.argv[2]

    if (audioFile) {
      console.log(`📝 Processing audio: ${audioFile}`)

      const result = await voicePipeline.process({
        input: audioFile, // Path to audio file
        outputPath: './response_audio.mp3',
      })

      console.log('✅ Voice Processing Complete')
      console.log(`📝 Transcribed: ${result.transcription}`)
      console.log(`💬 Response: ${result.response}`)
      console.log(`🔊 Audio saved: ${result.outputPath}`)
    } else {
      console.log('Usage: ts-node 11-voice-pipeline.ts <audio-file>')
      console.log(
        'Example: ts-node 11-voice-pipeline.ts ./sample.wav'
      )
    }
  } catch (error) {
    console.error('❌ Voice pipeline error:', error)
  }
}

main()
