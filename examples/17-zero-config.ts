/**
 * Zero-Config Example
 * ==================
 * Demonstrates the simplest way to use Gauss:
 * A single function call with intelligent defaults.
 * Perfect for quick scripts and prototyping.
 */

import gauss from 'gauss'

async function main() {
  console.log('🚀 Zero-Config Gauss Demo\n')

  try {
    // The absolute simplest way to use Gauss
    // Uses default provider (OpenAI) and model (gpt-4)
    // Automatically reads OPENAI_API_KEY from environment

    console.log('💭 Asking: "What is the meaning of life?"\n')

    const answer = await gauss(
      'What is the meaning of life?'
    )

    console.log('✨ Answer:')
    console.log(answer)
    console.log()

    // Multi-turn conversation
    console.log('---\n')
    console.log('💬 Multi-turn conversation:\n')

    const conversation = await gauss.chat([
      { role: 'user', content: 'Tell me a short joke' },
      { role: 'assistant', content: await gauss('Tell me a short joke') },
      {
        role: 'user',
        content: 'Why was that funny? Explain the humor.',
      },
    ])

    console.log(conversation)
    console.log()

    // Structured output
    console.log('---\n')
    console.log('📋 Structured output:\n')

    const structured = await gauss.structured({
      prompt: 'Generate a person profile',
      schema: {
        name: 'string',
        age: 'number',
        profession: 'string',
        skills: ['string'],
      },
    })

    console.log(JSON.stringify(structured, null, 2))
    console.log()

    console.log('✅ Zero-config demo complete!')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('\nMake sure OPENAI_API_KEY is set:')
    console.error('  export OPENAI_API_KEY="sk-..."')
  }
}

main()
