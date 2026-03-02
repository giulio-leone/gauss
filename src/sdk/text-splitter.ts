/**
 * Text splitting utilities for RAG document chunking.
 */

export interface TextSplitterOptions {
  /** Target chunk size in characters (default: 1000). */
  chunkSize?: number;
  /** Overlap between chunks in characters (default: 200). */
  chunkOverlap?: number;
  /** Separators to split on, in priority order. */
  separators?: string[];
}

export interface TextChunk {
  content: string;
  index: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

export class TextSplitter {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly separators: string[];

  constructor(options: TextSplitterOptions = {}) {
    this.chunkSize = options.chunkSize ?? 1000;
    this.chunkOverlap = options.chunkOverlap ?? 200;
    this.separators = options.separators ?? DEFAULT_SEPARATORS;
  }

  split(text: string): TextChunk[] {
    const chunks = this._splitRecursive(text, this.separators);
    return chunks.map((content, index) => ({ content, index }));
  }

  private _splitRecursive(text: string, separators: string[]): string[] {
    if (text.length <= this.chunkSize) return [text];
    
    const separator = separators[0] ?? "";
    const remainingSeparators = separators.slice(1);
    
    const parts = separator ? text.split(separator) : [...text];
    const result: string[] = [];
    let current = "";
    
    for (const part of parts) {
      const candidate = current ? current + separator + part : part;
      if (candidate.length > this.chunkSize && current) {
        result.push(current);
        // Apply overlap
        const overlapStart = Math.max(0, current.length - this.chunkOverlap);
        current = current.slice(overlapStart) + separator + part;
        if (current.length > this.chunkSize && remainingSeparators.length > 0) {
          const subChunks = this._splitRecursive(current, remainingSeparators);
          current = subChunks.pop() ?? "";
          result.push(...subChunks);
        }
      } else {
        current = candidate;
      }
    }
    
    if (current) result.push(current);
    return result;
  }
}

/**
 * Convenience function to split text into chunks.
 */
export function splitText(text: string, options?: TextSplitterOptions): TextChunk[] {
  return new TextSplitter(options).split(text);
}
