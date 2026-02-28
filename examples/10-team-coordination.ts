/**
 * Team Coordination Example
 * ========================
 * Demonstrates TeamBuilder with a coordinator agent and specialist agents.
 * Shows delegation patterns and team-based task execution.
 */

import { agent, team } from 'gauss'
import { openai } from 'gauss/providers'

async function main() {
  // Initialize provider
  const provider = openai({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
  })

  // Create specialist agents
  const dataSpecialist = agent({
    name: 'DataSpecialist',
    role: 'Analyzes data and provides insights',
    provider,
  })

  const writingSpecialist = agent({
    name: 'WritingSpecialist',
    role: 'Writes clear, concise reports',
    provider,
  })

  // Create coordinator agent that delegates work
  const coordinator = agent({
    name: 'ProjectCoordinator',
    role: 'Coordinates work between specialists',
    provider,
  })

  // Build team with delegation strategy
  const projectTeam = team({
    coordinator,
    specialists: [dataSpecialist, writingSpecialist],
    strategy: 'delegate', // Coordinator decides who does what
  })

  // Execute team task
  const task = 'Analyze Q4 sales data and write an executive summary'

  console.log(`📋 Team Task: ${task}\n`)

  try {
    const result = await projectTeam.run({
      task,
      context: {
        salesData: {
          q4Total: '$2.5M',
          growth: '+35%',
          topProduct: 'Enterprise Plan',
        },
      },
    })

    console.log('✅ Team Results:')
    console.log('---')
    result.contributions.forEach((contrib) => {
      console.log(`\n${contrib.agent}: ${contrib.summary}`)
    })
    console.log('---')
    console.log('\n📊 Final Output:')
    console.log(result.output)
  } catch (error) {
    console.error('❌ Team execution failed:', error)
  }
}

main()
