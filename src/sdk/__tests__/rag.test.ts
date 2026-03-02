/**
 * Unit tests for RAG features: TextSplitter, document loaders, VectorStore.searchByText.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("gauss-napi", () => ({
  create_vector_store: vi.fn(() => 1),
  vector_store_upsert: vi.fn(async () => undefined),
  vector_store_search: vi.fn(async () => [
    { id: "c1", text: "hello", score: 0.95 },
  ]),
  destroy_vector_store: vi.fn(),
  cosine_similarity: vi.fn(() => 0.95),
}));

import { TextSplitter, splitText } from "../text-splitter.js";
import { loadText, loadMarkdown, loadJson } from "../document-loader.js";
import { VectorStore } from "../vector-store.js";
import { vector_store_search } from "gauss-napi";

beforeEach(() => vi.clearAllMocks());

// ─── TextSplitter ──────────────────────────────────────────────────

describe("TextSplitter", () => {
  it("splits long text into multiple chunks", () => {
    // Build text with paragraph separators so the splitter can find split points
    const para = "Hello world. ".repeat(20).trim();
    const text = [para, para, para, para].join("\n\n");
    const splitter = new TextSplitter({ chunkSize: 300, chunkOverlap: 50 });
    const chunks = splitter.split(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.content.length).toBeGreaterThan(0);
    });
  });

  it("returns single chunk when text is small", () => {
    const chunks = new TextSplitter({ chunkSize: 1000 }).split("short text");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("short text");
    expect(chunks[0].index).toBe(0);
  });

  it("applies overlap between chunks", () => {
    const para = "Hello world. ".repeat(20).trim();
    const text = [para, para, para, para].join("\n\n");
    const splitter = new TextSplitter({ chunkSize: 300, chunkOverlap: 100 });
    const chunks = splitter.split(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // With overlap, second chunk should contain some ending text from the first
    const tail = chunks[0].content.slice(-50);
    expect(chunks[1].content).toContain(tail);
  });

  it("accepts custom separators", () => {
    const text = "a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t";
    const splitter = new TextSplitter({
      chunkSize: 10,
      chunkOverlap: 0,
      separators: ["|"],
    });
    const chunks = splitter.split(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("uses markdown separators", () => {
    const md = "# Title\n\nParagraph one.\n\n## Section\n\nParagraph two.";
    const splitter = new TextSplitter({
      chunkSize: 30,
      chunkOverlap: 0,
      separators: ["\n\n", "\n", " "],
    });
    const chunks = splitter.split(md);
    expect(chunks.length).toBeGreaterThan(1);
  });
});

// ─── splitText convenience ─────────────────────────────────────────

describe("splitText", () => {
  it("produces same result as TextSplitter.split()", () => {
    const text = "hello world this is a test of the splitter function";
    const opts = { chunkSize: 20, chunkOverlap: 5 };
    const fromClass = new TextSplitter(opts).split(text);
    const fromFn = splitText(text, opts);
    expect(fromFn).toEqual(fromClass);
  });
});

// ─── loadText ──────────────────────────────────────────────────────

describe("loadText", () => {
  it("loads string content and returns VectorChunks", async () => {
    const content = "This is a test document.\nIt has multiple lines.";
    const doc = await loadText(content, { documentId: "doc1" });
    expect(doc.documentId).toBe("doc1");
    expect(doc.content).toBe(content);
    expect(doc.chunks.length).toBeGreaterThan(0);
    expect(doc.chunks[0].id).toBe("doc1-0");
    expect(doc.chunks[0].documentId).toBe("doc1");
    expect(doc.chunks[0].content).toBe(content);
  });

  it("assigns sequential chunk ids", async () => {
    const long = "paragraph one\n\n" + "word ".repeat(300);
    const doc = await loadText(long, {
      documentId: "d2",
      chunkSize: 200,
      chunkOverlap: 20,
    });
    doc.chunks.forEach((c, i) => {
      expect(c.id).toBe(`d2-${i}`);
      expect(c.index).toBe(i);
    });
  });
});

// ─── loadMarkdown ──────────────────────────────────────────────────

describe("loadMarkdown", () => {
  it("strips frontmatter", async () => {
    const md = "---\ntitle: Test\n---\n# Heading\n\nBody text here.";
    const doc = await loadMarkdown(md, { documentId: "md1" });
    expect(doc.content).not.toContain("---");
    expect(doc.content).toContain("Heading");
  });

  it("splits on heading separators", async () => {
    const md =
      "# Title\n\nIntro paragraph.\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B.";
    const doc = await loadMarkdown(md, {
      documentId: "md2",
      chunkSize: 30,
      chunkOverlap: 0,
    });
    expect(doc.chunks.length).toBeGreaterThan(1);
  });
});

// ─── loadJson ──────────────────────────────────────────────────────

describe("loadJson", () => {
  it("handles array input — each item is a chunk", async () => {
    const json = JSON.stringify([{ name: "a" }, { name: "b" }]);
    const doc = await loadJson(json, { documentId: "j1" });
    expect(doc.chunks).toHaveLength(2);
    expect(doc.chunks[0].id).toBe("j1-0");
    expect(doc.chunks[1].id).toBe("j1-1");
  });

  it("handles object input — each key is a chunk", async () => {
    const json = JSON.stringify({ intro: "Hello", body: "World" });
    const doc = await loadJson(json, { documentId: "j2" });
    expect(doc.chunks).toHaveLength(2);
    expect(doc.chunks[0].id).toBe("j2-intro");
    expect(doc.chunks[0].content).toBe("Hello");
    expect(doc.chunks[1].id).toBe("j2-body");
    expect(doc.chunks[1].content).toBe("World");
  });

  it("extracts textField from array items", async () => {
    const json = JSON.stringify([
      { title: "One", body: "First body" },
      { title: "Two", body: "Second body" },
    ]);
    const doc = await loadJson(json, { documentId: "j3", textField: "body" });
    expect(doc.chunks[0].content).toBe("First body");
    expect(doc.chunks[1].content).toBe("Second body");
  });
});

// ─── VectorStore.searchByText ──────────────────────────────────────

describe("VectorStore.searchByText", () => {
  it("calls embedFn then delegates to search", async () => {
    const embedFn = vi.fn(async () => [0.1, 0.2, 0.3]);
    const store = new VectorStore();
    const results = await store.searchByText("hello world", 5, embedFn);

    expect(embedFn).toHaveBeenCalledWith("hello world");
    expect(vector_store_search).toHaveBeenCalledWith(
      1,
      JSON.stringify([0.1, 0.2, 0.3]),
      5,
    );
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.95);
    store.destroy();
  });
});
