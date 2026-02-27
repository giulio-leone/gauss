// =============================================================================
// MarkdownDocumentAdapter — Extract, transform, chunk markdown content
// =============================================================================

import type { DocumentPort, Document, ChunkOptions } from "../../ports/document.port.js";

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

export class MarkdownDocumentAdapter implements DocumentPort {
  async extract(source: string, _mimeType?: string): Promise<Document[]> {
    // Source is raw text content
    return [
      {
        id: generateId(source),
        content: source,
        source: "inline",
        metadata: {},
      },
    ];
  }

  async transform(documents: Document[]): Promise<Document[]> {
    return documents.map((doc) => ({
      ...doc,
      // Normalize whitespace, trim
      content: doc.content.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    }));
  }

  async chunk(documents: Document[], options?: ChunkOptions): Promise<Document[]> {
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const overlap = options?.chunkOverlap ?? DEFAULT_OVERLAP;
    const separator = options?.separator ?? "\n\n";

    const result: Document[] = [];

    for (const doc of documents) {
      const segments = doc.content.split(separator);
      let currentChunk = "";
      let chunkIndex = 0;
      const chunks: string[] = [];

      for (const segment of segments) {
        if (currentChunk.length + segment.length + separator.length > chunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          // Overlap: keep tail of current chunk
          if (overlap > 0) {
            currentChunk = currentChunk.slice(-overlap) + separator + segment;
          } else {
            currentChunk = segment;
          }
        } else {
          currentChunk = currentChunk
            ? currentChunk + separator + segment
            : segment;
        }
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }

      for (const chunk of chunks) {
        result.push({
          id: `${doc.id}-chunk-${chunkIndex}`,
          content: chunk,
          source: doc.source,
          chunkIndex,
          totalChunks: chunks.length,
          metadata: { ...doc.metadata, parentId: doc.id },
        });
        chunkIndex++;
      }
    }

    return result;
  }
}

function generateId(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return `doc-${Math.abs(hash).toString(36)}`;
}
