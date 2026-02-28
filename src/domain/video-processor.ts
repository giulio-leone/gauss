// =============================================================================
// Video Processing — Frame extraction, analysis, audio extraction
// =============================================================================

import type { LanguageModel } from "ai";
import {
  MultimodalAgent,
  type ImageInput,
  type MultimodalResult,
} from "./multimodal.js";

// =============================================================================
// Types
// =============================================================================

export type VideoSource =
  | { type: "url"; url: string }
  | { type: "file"; path: string }
  | { type: "base64"; data: string; mimeType: string };

export interface VideoInput {
  source: VideoSource;
  /** Duration in seconds (if known) */
  duration?: number;
}

export interface VideoFrame {
  index: number;
  timestampMs: number;
  image: ImageInput;
}

export interface FrameExtractionOptions {
  /** Interval between frames in milliseconds (default: 1000) */
  intervalMs?: number;
  /** Maximum number of frames to extract (default: 30) */
  maxFrames?: number;
  /** Start time in milliseconds */
  startMs?: number;
  /** End time in milliseconds */
  endMs?: number;
}

export interface VideoAnalysisResult {
  description: string;
  frames: Array<{
    index: number;
    timestampMs: number;
    description: string;
  }>;
  duration?: number;
  durationMs: number;
}

export interface AudioExtractionResult {
  audio: Uint8Array;
  format: string;
  durationMs: number;
}

// =============================================================================
// FrameExtractor — Extracts frames from video at intervals
// =============================================================================

export interface FrameExtractorPort {
  extractFrames(
    video: VideoInput,
    options?: FrameExtractionOptions
  ): Promise<VideoFrame[]>;
  extractAudio?(video: VideoInput): Promise<AudioExtractionResult>;
}

/**
 * Default frame extractor — generates placeholder frames.
 * In production, replace with ffmpeg-based or browser Canvas adapter.
 */
export class DefaultFrameExtractor implements FrameExtractorPort {
  async extractFrames(
    video: VideoInput,
    options: FrameExtractionOptions = {}
  ): Promise<VideoFrame[]> {
    const intervalMs = options.intervalMs ?? 1000;
    const maxFrames = options.maxFrames ?? 30;
    const startMs = options.startMs ?? 0;
    const durationMs = (video.duration ?? 30) * 1000;
    const endMs = options.endMs ?? durationMs;

    const frames: VideoFrame[] = [];
    let ts = startMs;
    let index = 0;

    while (ts < endMs && index < maxFrames) {
      frames.push({
        index,
        timestampMs: ts,
        image: this.frameToImage(video, ts),
      });
      ts += intervalMs;
      index++;
    }

    return frames;
  }

  private frameToImage(video: VideoInput, timestampMs: number): ImageInput {
    // In production, this extracts actual frame data
    const sourceId =
      video.source.type === "url"
        ? video.source.url
        : video.source.type === "file"
          ? video.source.path
          : "base64-video";

    return {
      source: {
        type: "url",
        url: `frame://${sourceId}?t=${timestampMs}`,
      },
    };
  }
}

// =============================================================================
// VideoProcessor — Orchestrates frame extraction + multimodal analysis
// =============================================================================

export class VideoProcessor {
  private multimodal: MultimodalAgent;
  private frameExtractor: FrameExtractorPort;

  constructor(config: {
    model: LanguageModel;
    instructions?: string;
    frameExtractor?: FrameExtractorPort;
  }) {
    this.multimodal = new MultimodalAgent({
      model: config.model,
      instructions: config.instructions ?? "You are a video analysis expert.",
    });
    this.frameExtractor =
      config.frameExtractor ?? new DefaultFrameExtractor();
  }

  /** Extract frames from video at specified intervals */
  async extractFrames(
    video: VideoInput,
    options?: FrameExtractionOptions
  ): Promise<VideoFrame[]> {
    return this.frameExtractor.extractFrames(video, options);
  }

  /** Describe video by analyzing individual frames and synthesizing */
  async describeVideo(
    video: VideoInput,
    options?: FrameExtractionOptions & { prompt?: string }
  ): Promise<VideoAnalysisResult> {
    const start = Date.now();
    const frames = await this.extractFrames(video, options);

    // Analyze each frame
    const frameDescriptions = await Promise.all(
      frames.map(async (frame) => {
        const result = await this.multimodal.describeImage(
          frame.image,
          `Describe what is happening at timestamp ${frame.timestampMs}ms in this video frame.`
        );
        return {
          index: frame.index,
          timestampMs: frame.timestampMs,
          description: result.text,
        };
      })
    );

    // Synthesize overall description
    const framesSummary = frameDescriptions
      .map((f) => `[${f.timestampMs}ms] ${f.description}`)
      .join("\n");

    const synthesis = await this.multimodal.process([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Based on these video frame descriptions, provide a coherent summary of what happens in the video:\n\n${framesSummary}\n\n${options?.prompt ?? "Describe the video."}`,
          },
        ],
      },
    ]);

    return {
      description: synthesis.text,
      frames: frameDescriptions,
      duration: video.duration,
      durationMs: Date.now() - start,
    };
  }

  /** Extract audio from video (requires FrameExtractorPort with audio support) */
  async extractAudio(video: VideoInput): Promise<AudioExtractionResult> {
    if (!this.frameExtractor.extractAudio) {
      throw new Error(
        "Audio extraction not supported by current FrameExtractor. " +
          "Provide a FrameExtractorPort that implements extractAudio()."
      );
    }
    return this.frameExtractor.extractAudio(video);
  }
}

// =============================================================================
// Factory function
// =============================================================================

export function videoProcessor(config: {
  model: LanguageModel;
  instructions?: string;
  frameExtractor?: FrameExtractorPort;
}): VideoProcessor {
  return new VideoProcessor(config);
}
