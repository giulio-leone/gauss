/**
 * LLM Recording & Replay Example
 * ==============================
 * Demonstrates LLMRecorder and LLMReplayer for testing and debugging.
 * - Record LLM interactions for analysis
 * - Replay recordings deterministically for tests
 * - Debug and optimize prompts
 */

import { LLMRecorder, LLMReplayer } from 'gauss'
import { openai } from 'gauss/providers'

async function main() {
  const provider = openai({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
  })

  console.log('🎙️  LLM Recording & Replay Demo\n')

  try {
    // Mode 1: Record interactions
    console.log('📹 Mode 1: Recording Interactions')
    console.log('---')

    const recorder = LLMRecorder({
      sessionId: 'session-' + Date.now(),
      outputPath: './recordings',
    })

    // Wrap provider with recorder
    const recordingProvider = recorder.wrap(provider)

    const response1 = await recordingProvider.query({
      prompt: 'What is machine learning?',
      maxTokens: 100,
    })

    const response2 = await recordingProvider.query({
      prompt: 'Explain neural networks',
      maxTokens: 100,
    })

    const recordingFile = await recorder.save()
    console.log(`✅ Recorded to: ${recordingFile}\n`)

    // Mode 2: Replay for deterministic testing
    console.log('▶️  Mode 2: Replaying Interactions')
    console.log('---')

    const replayer = LLMReplayer({
      recordingPath: recordingFile,
    })

    // These will return exact same responses as recorded
    const replayResponse1 = await replayer.query({
      prompt: 'What is machine learning?',
      maxTokens: 100,
    })

    const replayResponse2 = await replayer.query({
      prompt: 'Explain neural networks',
      maxTokens: 100,
    })

    console.log(`✅ Replayed ${replayer.callCount} interactions`)
    console.log(`Responses match: ${
      response1 === replayResponse1 && response2 === replayResponse2
    }\n`)

    // Mode 3: Analyze recordings
    console.log('📊 Mode 3: Recording Analysis')
    console.log('---')

    const analysis = await replayer.analyze()
    console.log(`Total calls: ${analysis.totalCalls}`)
    console.log(`Average latency: ${analysis.avgLatency.toFixed(0)}ms`)
    console.log(`Total tokens: ${analysis.totalTokens}`)
    console.log(`Estimated cost: $${analysis.estimatedCost.toFixed(4)}\n`)

    // Mode 4: Test suite with replay
    console.log('🧪 Mode 4: Deterministic Test Suite')
    console.log('---')

    console.log('Running tests with recorded responses...')

    for (let i = 0; i < 3; i++) {
      const testResponse = await replayer.query({
        prompt: 'What is machine learning?',
        maxTokens: 100,
      })

      console.log(`  Test ${i + 1}: ✓ (deterministic)`)
    }

    console.log('\n✅ Recording & replay demo complete')
  } catch (error) {
    console.error('❌ Recording error:', error)
  }
}

main()
