/**
 * Multimodal Vision Example
 * ========================
 * Demonstrates MultimodalAgent for image understanding:
 * - Image description and analysis
 * - Text extraction (OCR)
 * - Image comparison and similarity
 */

import { multimodal } from 'gauss'
import { openai } from 'gauss/providers'

async function main() {
  const provider = openai({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-vision',
  })

  // Create multimodal agent with vision capabilities
  const visionAgent = multimodal.agent({
    name: 'VisionAnalyzer',
    provider,
  })

  console.log('👁️  Multimodal Vision Agent\n')

  try {
    // Example 1: Describe an image
    console.log('📸 Example 1: Image Description')
    console.log('---')

    const description = await visionAgent.describeImage({
      imagePath: process.argv[2] || './sample-image.jpg',
      context: 'Analyze the image and describe what you see',
    })

    console.log(`Description: ${description}`)
    console.log()

    // Example 2: Extract text (OCR)
    console.log('📄 Example 2: Text Extraction (OCR)')
    console.log('---')

    const extractedText = await visionAgent.extractText({
      imagePath: process.argv[3] || './document.png',
    })

    console.log(`Extracted Text:\n${extractedText}`)
    console.log()

    // Example 3: Compare two images
    console.log('🔀 Example 3: Image Comparison')
    console.log('---')

    const comparison = await visionAgent.compareImages({
      image1: process.argv[2] || './image1.jpg',
      image2: process.argv[3] || './image2.jpg',
      aspect: 'overall similarity and differences',
    })

    console.log(`Comparison: ${comparison}`)
    console.log()

    // Example 4: Analyze image for specific content
    console.log('🎯 Example 4: Targeted Analysis')
    console.log('---')

    const analysis = await visionAgent.analyze({
      imagePath: process.argv[2] || './chart.png',
      questions: [
        'What is the main trend?',
        'What are the key numbers?',
        'What insights can you draw?',
      ],
    })

    console.log('Answers:')
    analysis.forEach((answer, idx) => {
      console.log(`  ${idx + 1}. ${answer}`)
    })

    console.log('\n✅ Vision analysis complete')
  } catch (error) {
    console.error('❌ Vision agent error:', error)
    console.log('Tip: Provide image paths as arguments')
  }
}

main()
