/**
 * Video Processing Example
 * =======================
 * Demonstrates VideoProcessor for video analysis:
 * - Video description with frame extraction
 * - Scene detection and summarization
 * - Activity recognition
 */

import { videoProcessor } from 'gauss'
import { openai } from 'gauss/providers'

async function main() {
  const provider = openai({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-vision',
  })

  // Create video processor
  const processor = videoProcessor({
    provider,
    frameInterval: 5, // Extract frame every 5 seconds
    maxFrames: 10, // Maximum frames to process
  })

  console.log('🎬 Video Processing Agent\n')

  try {
    const videoFile = process.argv[2]

    if (!videoFile) {
      console.log('Usage: ts-node 14-video-processing.ts <video-file>')
      console.log('Example: ts-node 14-video-processing.ts ./sample.mp4')
      return
    }

    console.log(`📽️  Processing: ${videoFile}\n`)

    // Extract and analyze frames
    console.log('🎞️  Extracting frames...')
    const frames = await processor.extractFrames(videoFile)
    console.log(`✅ Extracted ${frames.length} frames\n`)

    // Describe overall video content
    console.log('📝 Generating video description...')
    const description = await processor.describeVideo({
      videoPath: videoFile,
      detailed: true,
    })
    console.log(`Description:\n${description}\n`)

    // Detect scenes and transitions
    console.log('🎯 Detecting scenes...')
    const scenes = await processor.detectScenes(videoFile)
    console.log('Scenes detected:')
    scenes.forEach((scene, idx) => {
      console.log(`  Scene ${idx + 1}: ${scene.description} (${scene.duration}s)`)
    })
    console.log()

    // Summarize key activities
    console.log('📊 Summarizing activities...')
    const summary = await processor.summarizeActivities(videoFile)
    console.log(`Activities Summary:\n${summary}\n`)

    // Extract audio transcription
    console.log('🔊 Extracting audio...')
    const transcript = await processor.extractAudio(videoFile)
    console.log(`Transcript:\n${transcript}\n`)

    console.log('✅ Video processing complete')
  } catch (error) {
    console.error('❌ Video processing error:', error)
  }
}

main()
