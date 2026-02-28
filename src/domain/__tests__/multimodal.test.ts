import { describe, it, expect, vi } from "vitest";
import {
  MultimodalAgent,
  multimodal,
  type ImageInput,
  type MultimodalMessage,
} from "../multimodal.js";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "A photo of a sunset over the ocean.",
    usage: { inputTokens: 50, outputTokens: 15 },
    finishReason: "stop",
  }),
}));

const mockModel = { modelId: "gpt-4o" } as any;

describe("MultimodalAgent", () => {
  it("creates via factory", () => {
    const agent = multimodal({ model: mockModel });
    expect(agent).toBeInstanceOf(MultimodalAgent);
  });

  it("processes multimodal messages", async () => {
    const agent = new MultimodalAgent({ model: mockModel });
    const messages: MultimodalMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: {
              source: { type: "url", url: "https://example.com/photo.jpg" },
            },
          },
          { type: "text", text: "What is in this image?" },
        ],
      },
    ];

    const result = await agent.process(messages);
    expect(result.text).toBe("A photo of a sunset over the ocean.");
    expect(result.usage?.inputTokens).toBe(50);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("describeImage shortcut", async () => {
    const agent = new MultimodalAgent({ model: mockModel });
    const image: ImageInput = {
      source: { type: "url", url: "https://example.com/photo.jpg" },
    };

    const result = await agent.describeImage(image);
    expect(result.text).toBeDefined();
  });

  it("describeImage with custom prompt", async () => {
    const agent = new MultimodalAgent({
      model: mockModel,
      instructions: "You are an art critic.",
    });
    const image: ImageInput = {
      source: { type: "base64", data: "abc123", mimeType: "image/png" },
      detail: "high",
    };

    const result = await agent.describeImage(image, "Analyze the composition");
    expect(result.text).toBeDefined();
  });

  it("extractText (OCR) shortcut", async () => {
    const agent = new MultimodalAgent({ model: mockModel });
    const image: ImageInput = {
      source: { type: "file", path: "/tmp/document.png" },
    };

    const result = await agent.extractText(image);
    expect(result.text).toBeDefined();
  });

  it("compareImages shortcut", async () => {
    const agent = new MultimodalAgent({ model: mockModel });
    const img1: ImageInput = {
      source: { type: "url", url: "https://example.com/a.jpg" },
    };
    const img2: ImageInput = {
      source: { type: "url", url: "https://example.com/b.jpg" },
    };

    const result = await agent.compareImages(img1, img2);
    expect(result.text).toBeDefined();
  });

  it("supports all image source types", () => {
    const urlImage: ImageInput = {
      source: { type: "url", url: "https://example.com/img.jpg" },
    };
    const base64Image: ImageInput = {
      source: { type: "base64", data: "abc", mimeType: "image/jpeg" },
    };
    const fileImage: ImageInput = {
      source: { type: "file", path: "/tmp/img.png" },
    };

    expect(urlImage.source.type).toBe("url");
    expect(base64Image.source.type).toBe("base64");
    expect(fileImage.source.type).toBe("file");
  });

  it("handles detail parameter", () => {
    const image: ImageInput = {
      source: { type: "url", url: "https://example.com/img.jpg" },
      detail: "high",
    };
    expect(image.detail).toBe("high");
  });

  it("processes multiple messages", async () => {
    const agent = new MultimodalAgent({ model: mockModel });
    const messages: MultimodalMessage[] = [
      {
        role: "system",
        content: [{ type: "text", text: "You are helpful." }],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze these" },
          {
            type: "image",
            image: { source: { type: "url", url: "https://example.com/a.jpg" } },
          },
        ],
      },
    ];

    const result = await agent.process(messages);
    expect(result.text).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
