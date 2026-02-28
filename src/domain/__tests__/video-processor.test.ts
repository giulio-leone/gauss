import { describe, it, expect, vi } from "vitest";
import {
  VideoProcessor,
  DefaultFrameExtractor,
  videoProcessor,
  type VideoInput,
  type FrameExtractorPort,
} from "../video-processor.js";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "A person walking in a park.",
    usage: { inputTokens: 50, outputTokens: 15 },
    finishReason: "stop",
  }),
}));

const mockModel = { modelId: "gpt-4o" } as any;

describe("DefaultFrameExtractor", () => {
  it("extracts frames at default interval", async () => {
    const extractor = new DefaultFrameExtractor();
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/video.mp4" },
      duration: 5,
    };

    const frames = await extractor.extractFrames(video);
    expect(frames).toHaveLength(5);
    expect(frames[0].timestampMs).toBe(0);
    expect(frames[1].timestampMs).toBe(1000);
    expect(frames[4].timestampMs).toBe(4000);
  });

  it("respects intervalMs option", async () => {
    const extractor = new DefaultFrameExtractor();
    const video: VideoInput = {
      source: { type: "file", path: "/tmp/video.mp4" },
      duration: 10,
    };

    const frames = await extractor.extractFrames(video, { intervalMs: 2000 });
    expect(frames).toHaveLength(5);
    expect(frames[1].timestampMs).toBe(2000);
  });

  it("respects maxFrames option", async () => {
    const extractor = new DefaultFrameExtractor();
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/long.mp4" },
      duration: 300,
    };

    const frames = await extractor.extractFrames(video, { maxFrames: 5 });
    expect(frames).toHaveLength(5);
  });

  it("respects start/end range", async () => {
    const extractor = new DefaultFrameExtractor();
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/video.mp4" },
      duration: 30,
    };

    const frames = await extractor.extractFrames(video, {
      startMs: 5000,
      endMs: 10000,
      intervalMs: 1000,
    });
    expect(frames).toHaveLength(5);
    expect(frames[0].timestampMs).toBe(5000);
    expect(frames[4].timestampMs).toBe(9000);
  });

  it("generates image references for frames", async () => {
    const extractor = new DefaultFrameExtractor();
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/video.mp4" },
      duration: 2,
    };

    const frames = await extractor.extractFrames(video);
    expect(frames[0].image.source.type).toBe("url");
  });
});

describe("VideoProcessor", () => {
  it("creates via factory", () => {
    const vp = videoProcessor({ model: mockModel });
    expect(vp).toBeInstanceOf(VideoProcessor);
  });

  it("extracts frames", async () => {
    const vp = new VideoProcessor({ model: mockModel });
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/video.mp4" },
      duration: 3,
    };

    const frames = await vp.extractFrames(video);
    expect(frames).toHaveLength(3);
  });

  it("describes a video", async () => {
    const vp = new VideoProcessor({ model: mockModel });
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/video.mp4" },
      duration: 2,
    };

    const result = await vp.describeVideo(video, { maxFrames: 2 });
    expect(result.description).toBeDefined();
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0].description).toBe("A person walking in a park.");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws on extractAudio without support", async () => {
    const vp = new VideoProcessor({ model: mockModel });
    const video: VideoInput = {
      source: { type: "url", url: "https://example.com/video.mp4" },
    };

    await expect(vp.extractAudio(video)).rejects.toThrow(
      "Audio extraction not supported"
    );
  });

  it("extracts audio with custom extractor", async () => {
    const customExtractor: FrameExtractorPort = {
      async extractFrames() {
        return [];
      },
      async extractAudio() {
        return {
          audio: new Uint8Array([1, 2, 3]),
          format: "mp3",
          durationMs: 100,
        };
      },
    };

    const vp = new VideoProcessor({
      model: mockModel,
      frameExtractor: customExtractor,
    });
    const result = await vp.extractAudio({
      source: { type: "url", url: "https://example.com/video.mp4" },
    });
    expect(result.format).toBe("mp3");
    expect(result.audio).toHaveLength(3);
  });

  it("accepts custom frame extractor", async () => {
    const custom: FrameExtractorPort = {
      async extractFrames() {
        return [
          {
            index: 0,
            timestampMs: 0,
            image: { source: { type: "url", url: "custom://frame0" } },
          },
        ];
      },
    };

    const vp = new VideoProcessor({
      model: mockModel,
      frameExtractor: custom,
    });
    const frames = await vp.extractFrames({
      source: { type: "url", url: "test" },
    });
    expect(frames).toHaveLength(1);
    expect((frames[0].image.source as any).url).toBe("custom://frame0");
  });

  it("supports all video source types", () => {
    const urlVideo: VideoInput = {
      source: { type: "url", url: "https://example.com/v.mp4" },
    };
    const fileVideo: VideoInput = {
      source: { type: "file", path: "/tmp/v.mp4" },
    };
    const b64Video: VideoInput = {
      source: { type: "base64", data: "abc", mimeType: "video/mp4" },
    };

    expect(urlVideo.source.type).toBe("url");
    expect(fileVideo.source.type).toBe("file");
    expect(b64Video.source.type).toBe("base64");
  });
});
