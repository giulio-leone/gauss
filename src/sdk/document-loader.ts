/**
 * Document loaders for RAG pipeline.
 * Load documents from various sources and split into chunks.
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { VectorChunk } from "./types.js";
import { TextSplitter, type TextSplitterOptions } from "./text-splitter.js";

export interface DocumentLoaderOptions extends TextSplitterOptions {
  /** Document ID (auto-generated from filename if omitted). */
  documentId?: string;
  /** Additional metadata to attach to every chunk. */
  metadata?: Record<string, unknown>;
}

export interface LoadedDocument {
  documentId: string;
  content: string;
  chunks: VectorChunk[];
  metadata: Record<string, unknown>;
}

/**
 * Load a plain text file and split into chunks.
 */
export async function loadText(
  pathOrContent: string,
  options: DocumentLoaderOptions = {}
): Promise<LoadedDocument> {
  const isPath = !pathOrContent.includes("\n") && pathOrContent.length < 500;
  let content: string;
  let docId: string;

  if (isPath) {
    try {
      content = await readFile(pathOrContent, "utf-8");
      docId = options.documentId ?? basename(pathOrContent);
    } catch {
      content = pathOrContent;
      docId = options.documentId ?? "text-document";
    }
  } else {
    content = pathOrContent;
    docId = options.documentId ?? "text-document";
  }

  const splitter = new TextSplitter(options);
  const textChunks = splitter.split(content);
  const chunks: VectorChunk[] = textChunks.map((tc) => ({
    id: `${docId}-${tc.index}`,
    documentId: docId,
    content: tc.content,
    index: tc.index,
    metadata: { ...options.metadata, ...tc.metadata },
  }));

  return { documentId: docId, content, chunks, metadata: options.metadata ?? {} };
}

/**
 * Load a Markdown file — strips frontmatter, splits on headings.
 */
export async function loadMarkdown(
  pathOrContent: string,
  options: DocumentLoaderOptions = {}
): Promise<LoadedDocument> {
  const result = await loadText(pathOrContent, {
    ...options,
    separators: ["\n## ", "\n### ", "\n\n", "\n", ". ", " "],
  });
  // Strip YAML frontmatter
  result.content = result.content.replace(/^---[\s\S]*?---\n?/, "");
  return result;
}

/**
 * Load a JSON file — each top-level key or array item becomes a chunk.
 */
export async function loadJson(
  pathOrContent: string,
  options: DocumentLoaderOptions & { textField?: string } = {}
): Promise<LoadedDocument> {
  let raw: string;
  let docId: string;

  const isPath = !pathOrContent.includes("\n") && pathOrContent.length < 500;
  if (isPath) {
    try {
      raw = await readFile(pathOrContent, "utf-8");
      docId = options.documentId ?? basename(pathOrContent);
    } catch {
      raw = pathOrContent;
      docId = options.documentId ?? "json-document";
    }
  } else {
    raw = pathOrContent;
    docId = options.documentId ?? "json-document";
  }

  const parsed = JSON.parse(raw);
  const items: Array<{ key: string; text: string }> = [];

  if (Array.isArray(parsed)) {
    parsed.forEach((item, i) => {
      const text = options.textField ? String(item[options.textField] ?? "") : JSON.stringify(item);
      items.push({ key: String(i), text });
    });
  } else if (typeof parsed === "object" && parsed !== null) {
    for (const [key, value] of Object.entries(parsed)) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      items.push({ key, text });
    }
  }

  const chunks: VectorChunk[] = items.map((item, index) => ({
    id: `${docId}-${item.key}`,
    documentId: docId,
    content: item.text,
    index,
    metadata: { ...options.metadata, key: item.key },
  }));

  return { documentId: docId, content: raw, chunks, metadata: options.metadata ?? {} };
}
