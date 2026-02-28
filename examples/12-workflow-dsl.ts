/**
 * Workflow DSL Example
 * ===================
 * Demonstrates the WorkflowDSL for building complex, multi-step workflows.
 * Shows sequential execution (.then()), branching, and parallel operations.
 */

import { workflow } from 'gauss'
import { openai } from 'gauss/providers'

async function main() {
  const provider = openai({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
  })

  console.log('🔄 Building workflow...\n')

  // Build workflow with DSL
  const contentWorkflow = workflow()
    // Step 1: Generate blog ideas
    .step('ideation', async () => {
      console.log('💡 Brainstorming blog topics...')
      return 'AI trends, sustainability, remote work'
    })
    // Step 2: Branch for parallel content creation
    .then((ideas) => {
      console.log(`📚 Creating content from: ${ideas}\n`)
      return ideas
    })
    .parallel([
      {
        name: 'outline',
        fn: async () => {
          console.log('  📋 Building outline...')
          return 'Introduction → Trends → Future → Conclusion'
        },
      },
      {
        name: 'research',
        fn: async () => {
          console.log('  🔍 Gathering research...')
          return 'Market reports, case studies, expert quotes'
        },
      },
      {
        name: 'seo',
        fn: async () => {
          console.log('  🔎 Planning SEO...')
          return 'Keywords: AI trends, future of work, sustainable tech'
        },
      },
    ])
    // Step 3: Combine results
    .then(async (results) => {
      console.log('\n✅ Parallel tasks complete\n')
      console.log('📝 Combined Results:')
      Object.entries(results).forEach(([key, value]) => {
        console.log(`  • ${key}: ${value}`)
      })
      return results
    })
    // Step 4: Conditional branching
    .branch({
      condition: () => true,
      true: async () => {
        console.log('\n📤 Publishing to blog...')
        return 'Published successfully'
      },
      false: async () => {
        console.log('\n💾 Saving as draft...')
        return 'Saved as draft'
      },
    })

  try {
    console.log('🚀 Executing workflow...\n')
    const result = await contentWorkflow.build()
    console.log('\n' + '='.repeat(50))
    console.log('✅ Workflow Complete!')
    console.log('='.repeat(50))
  } catch (error) {
    console.error('❌ Workflow failed:', error)
  }
}

main()
