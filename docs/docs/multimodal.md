---
sidebar_position: 6
title: Multimodal (Images & Video)
---

# Multimodal (Images & Video)

Handle images, video, and other media formats alongside text. The MultimodalAgent enables vision capabilities including image analysis, OCR, and video processing.

## MultimodalAgent

The `MultimodalAgent` extends the base Agent with vision and media analysis capabilities:

```typescript
import { MultimodalAgent } from 'gauss';
import { OpenAI } from 'gauss/providers';

const agent = new MultimodalAgent({
  model: 'gpt-4-vision',
  provider: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  instructions: 'Analyze images and answer questions about them.'
});
```

## Image Analysis

### Describe Images

Generate detailed descriptions of images:

```typescript
import { MultimodalAgent } from 'gauss';

const agent = new MultimodalAgent({
  model: 'gpt-4-vision'
});

// From URL
const description = await agent.describeImage({
  source: 'url',
  data: 'https://example.com/image.jpg'
});
console.log('Description:', description);

// From base64
const description = await agent.describeImage({
  source: 'base64',
  data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
});

// From file buffer
import { readFileSync } from 'fs';
const buffer = readFileSync('image.jpg');
const description = await agent.describeImage({
  source: 'buffer',
  data: buffer,
  mimeType: 'image/jpeg'
});
```

### Extract Text (OCR)

Extract text from images using optical character recognition:

```typescript
// Extract all text
const text = await agent.extractText({
  source: 'url',
  data: 'https://example.com/document.png'
});
console.log('Extracted Text:', text);

// Extract with layout preservation
const structured = await agent.extractText(
  {
    source: 'buffer',
    data: imageBuffer,
    mimeType: 'image/png'
  },
  {
    preserveLayout: true,
    includeStructure: true
  }
);
```

### Compare Images

Analyze differences and similarities between images:

```typescript
const comparison = await agent.compareImages(
  {
    source: 'url',
    data: 'https://example.com/image1.jpg'
  },
  {
    source: 'url',
    data: 'https://example.com/image2.jpg'
  },
  {
    analysisType: 'differences',  // 'differences', 'similarities', 'detailed'
    focus: 'objects'              // 'objects', 'colors', 'composition'
  }
);

console.log('Differences:', comparison.differences);
console.log('Similarity Score:', comparison.score);
```

## Image Sources

The MultimodalAgent supports multiple image source types:

### ImageSource Interface

```typescript
interface ImageSource {
  source: 'url' | 'base64' | 'buffer';
  data: string | Buffer;
  mimeType?: string;
}
```

### URL Source

```typescript
const urlSource: ImageSource = {
  source: 'url',
  data: 'https://example.com/image.jpg'
};

const result = await agent.describeImage(urlSource);
```

### Base64 Source

```typescript
const base64Source: ImageSource = {
  source: 'base64',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  mimeType: 'image/png'
};

const result = await agent.describeImage(base64Source);
```

### Buffer Source

```typescript
import { readFileSync } from 'fs';

const bufferSource: ImageSource = {
  source: 'buffer',
  data: readFileSync('screenshot.png'),
  mimeType: 'image/png'
};

const result = await agent.describeImage(bufferSource);
```

## Video Processing

### VideoProcessor

The `VideoProcessor` handles video analysis and audio extraction:

```typescript
import { VideoProcessor } from 'gauss';

const processor = new VideoProcessor({
  agent: multimodalAgent,
  frameRate: 1  // Extract 1 frame per second
});

// Describe entire video
const videoDescription = await processor.describeVideo('video.mp4');
console.log('Video Summary:', videoDescription.summary);
console.log('Key Scenes:', videoDescription.scenes);

// Extract audio track
const audioBuffer = await processor.extractAudio('video.mp4');
```

### Describe Video

Generate descriptions and summaries from video files:

```typescript
const description = await processor.describeVideo(
  'presentation.mp4',
  {
    maxFrames: 10,
    captureInterval: 5000,  // Every 5 seconds
    focusOn: 'content'      // 'content', 'action', 'all'
  }
);

console.log('Summary:', description.summary);
console.log('Scenes:', description.scenes);
console.log('Key Objects:', description.keyObjects);
console.log('Transcript:', description.transcript);  // If audio included
```

### Extract Audio

Extract audio from video files:

```typescript
import { writeFileSync } from 'fs';

// Extract audio
const audioBuffer = await processor.extractAudio('movie.mp4');

// Save extracted audio
writeFileSync('extracted_audio.wav', audioBuffer);

// Convert to text
const transcript = await processor.transcribeAudio(audioBuffer);
console.log('Transcript:', transcript);
```

## Custom Frame Extraction

Implement custom frame extraction strategies:

```typescript
interface FrameExtractorPort {
  extractFrames(
    videoPath: string,
    options?: ExtractOptions
  ): Promise<Frame[]>;
}

interface Frame {
  index: number;
  timestamp: number;
  buffer: Buffer;
  mimeType: string;
}

class CustomFrameExtractor implements FrameExtractorPort {
  async extractFrames(
    videoPath: string,
    options?: { interval?: number; maxFrames?: number }
  ): Promise<Frame[]> {
    // Implementation: extract frames at custom intervals
    // e.g., detect scene changes, extract key frames, etc.
  }
}
```

## Complete Example: Document Analysis

```typescript
import { MultimodalAgent } from 'gauss';
import { OpenAI } from 'gauss/providers';
import { readFileSync } from 'fs';

const agent = new MultimodalAgent({
  model: 'gpt-4-vision',
  provider: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  instructions: `You are a document analysis expert. 
    Analyze document images and extract:
    - Key information
    - Structure and sections
    - Important data points
    - Any anomalies or issues`
});

async function analyzeDocument(imagePath: string) {
  const buffer = readFileSync(imagePath);
  const imageSource = {
    source: 'buffer' as const,
    data: buffer,
    mimeType: 'image/png'
  };

  // Extract text
  console.log('📄 Extracting text...');
  const text = await agent.extractText(imageSource);
  console.log('Text:', text);

  // Get description
  console.log('\n📊 Analyzing structure...');
  const analysis = await agent.describeImage(imageSource);
  console.log('Analysis:', analysis);

  // Ask questions
  console.log('\n❓ Answering specific questions...');
  const response = await agent.respond(
    'What is the document date and what are the main sections?',
    [imageSource]
  );
  console.log('Answer:', response.text);

  return { text, analysis, response };
}

// Usage
await analyzeDocument('invoice.png');
```

## Example: Quality Control via Vision

```typescript
import { MultimodalAgent } from 'gauss';

const qcAgent = new MultimodalAgent({
  model: 'gpt-4-vision',
  instructions: `You are a quality control inspector.
    Analyze product images for:
    - Defects or damage
    - Color/size consistency
    - Packaging quality
    - Missing components`,
  tools: [
    {
      name: 'log_defect',
      description: 'Log a product defect',
      execute: async (defectType, severity, description) => {
        console.log(`Defect: ${defectType} (${severity})`);
        console.log(`Description: ${description}`);
        return { logged: true };
      }
    }
  ]
});

async function inspectProduct(imageUrl: string) {
  const report = await qcAgent.respond(
    'Inspect this product image and report any defects.',
    [{ source: 'url', data: imageUrl }]
  );
  
  console.log('QC Report:', report.text);
  return report;
}
```

## Example: Before/After Comparison

```typescript
async function compareBeforeAfter(
  beforePath: string,
  afterPath: string
) {
  const comparison = await agent.compareImages(
    {
      source: 'buffer',
      data: readFileSync(beforePath),
      mimeType: 'image/jpg'
    },
    {
      source: 'buffer',
      data: readFileSync(afterPath),
      mimeType: 'image/jpg'
    },
    {
      analysisType: 'detailed',
      focus: 'objects'
    }
  );

  console.log('Comparison Results:');
  console.log('- Differences:', comparison.differences);
  console.log('- Similarity:', comparison.score);
  console.log('- Details:', comparison.details);

  return comparison;
}

// Usage: home renovation, before/after photos
await compareBeforeAfter('before.jpg', 'after.jpg');
```

## Configuration Reference

### MultimodalAgent Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `gpt-4-vision` | Vision model to use |
| `provider` | Provider | required | Model provider |
| `instructions` | string | | System instructions |
| `maxTokens` | number | | Response limit |

### Video Processor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agent` | MultimodalAgent | required | Analysis agent |
| `frameRate` | number | `1` | Frames per second |
| `maxFrames` | number | `30` | Max frames to extract |
| `quality` | string | `medium` | Frame quality |

## Best Practices

- **Image Quality**: Ensure images are clear and well-lit
- **File Size**: Compress large images when possible
- **Format Support**: Use JPEG, PNG, WebP for best results
- **Batch Processing**: Use concurrent requests for multiple images
- **Caching**: Cache analysis results for repeated images
- **Error Handling**: Gracefully handle unanalyzable images
- **Video Duration**: Limit video length or use frame sampling
- **Privacy**: Be cautious with sensitive images/documents
