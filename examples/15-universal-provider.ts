/**
 * Universal Provider Example
 * =========================
 * Demonstrates UniversalProvider for seamless model switching.
 * - Dynamic provider loading
 * - Model discovery and listing
 * - Cross-provider compatibility
 */

import { universalProvider } from 'gauss/providers'

async function main() {
  console.log('🌐 Universal Provider Demo\n')

  try {
    // Initialize universal provider
    const uniProvider = universalProvider({
      apiKeys: {
        openai: process.env.OPENAI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY,
        google: process.env.GOOGLE_API_KEY,
      },
    })

    // Example 1: List available providers
    console.log('📋 Available Providers:')
    console.log('---')
    const providers = await uniProvider.listProviders()
    providers.forEach((p) => {
      console.log(`  • ${p.name} (${p.status})`)
    })
    console.log()

    // Example 2: Discover models for a specific provider
    console.log('🔍 Available Models:')
    console.log('---')

    const openaiModels = await uniProvider.discoverModels('openai')
    console.log('OpenAI:')
    openaiModels.slice(0, 5).forEach((m) => {
      console.log(`  • ${m.id} (${m.context} tokens)`)
    })

    const anthropicModels = await uniProvider.discoverModels('anthropic')
    console.log('\nAnthropic:')
    anthropicModels.slice(0, 5).forEach((m) => {
      console.log(`  • ${m.id} (${m.context} tokens)`)
    })
    console.log()

    // Example 3: Switch providers dynamically
    console.log('🔄 Dynamic Provider Switching:')
    console.log('---')

    const models = [
      { provider: 'openai', model: 'gpt-4' },
      { provider: 'anthropic', model: 'claude-3-opus' },
      { provider: 'google', model: 'gemini-pro' },
    ]

    for (const { provider: providerName, model } of models) {
      try {
        const response = await uniProvider.query({
          provider: providerName,
          model,
          prompt: 'Say "Hello" in one word.',
          maxTokens: 10,
        })

        console.log(`  ${providerName} (${model}): ${response}`)
      } catch (e) {
        console.log(
          `  ${providerName} (${model}): ⚠️  Not available`
        )
      }
    }
    console.log()

    // Example 4: Estimate costs across providers
    console.log('💰 Cost Estimation:')
    console.log('---')

    const prompt = 'Explain quantum computing in 100 words'
    const costs = await uniProvider.estimateCosts({
      prompt,
      providers: ['openai', 'anthropic', 'google'],
    })

    Object.entries(costs).forEach(([provider, cost]) => {
      console.log(`  ${provider}: $${cost.toFixed(6)}`)
    })

    console.log('\n✅ Universal provider demo complete')
  } catch (error) {
    console.error('❌ Universal provider error:', error)
  }
}

main()
