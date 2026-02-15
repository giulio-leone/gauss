// =============================================================================
// TiktokenTokenCounter — Accurate token counting via tiktoken
// =============================================================================

import type { Message } from "../../types.js";
import type { TokenCounterPort } from "../../ports/token-counter.port.js";
import { ApproximateTokenCounter } from "./approximate.adapter.js";

type TiktokenEncoding = {
  encode: (text: string) => ArrayLike<number>;
  free: () => void;
};
type TiktokenModule = {
  encoding_for_model: (model: string) => TiktokenEncoding;
  get_encoding: (encoding: string) => TiktokenEncoding;
};

const fallback = new ApproximateTokenCounter();

export class TiktokenTokenCounter implements TokenCounterPort {
  private tiktokenModule: TiktokenModule | null = null;
  private encodingCache = new Map<string, TiktokenEncoding>();
  private initPromise: Promise<void> | null = null;
  private available = false;
  private readonly maxCacheSize: number;

  constructor(options?: { maxCacheSize?: number }) {
    this.maxCacheSize = options?.maxCacheSize ?? 50;
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      this.tiktokenModule = (await import("tiktoken")) as TiktokenModule;
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  private evictIfNeeded(): void {
    while (this.encodingCache.size >= this.maxCacheSize) {
      const oldest = this.encodingCache.keys().next().value as string;
      const enc = this.encodingCache.get(oldest);
      this.encodingCache.delete(oldest);
      try { enc?.free(); } catch { /* ignore */ }
    }
  }

  private getEncoding(model?: string): TiktokenEncoding | null {
    if (!this.available || !this.tiktokenModule) return null;

    const key = model ?? "cl100k_base";
    const cached = this.encodingCache.get(key);
    if (cached) return cached;

    this.evictIfNeeded();

    try {
      const enc = model
        ? this.tiktokenModule.encoding_for_model(model)
        : this.tiktokenModule.get_encoding("cl100k_base");
      this.encodingCache.set(key, enc);
      return enc;
    } catch {
      // Unknown model, use default encoding
      try {
        const enc = this.tiktokenModule.get_encoding("cl100k_base");
        this.encodingCache.set(key, enc);
        return enc;
      } catch {
        return null;
      }
    }
  }

  count(text: string, model?: string): number {
    if (!text) return 0;
    const enc = this.getEncoding(model);
    if (!enc) return fallback.count(text);
    return enc.encode(text).length;
  }

  countMessages(messages: Message[], model?: string): number {
    if (!messages.length) return 0;
    const enc = this.getEncoding(model);
    if (!enc) return fallback.countMessages(messages);
    return messages.reduce(
      (sum, msg) => sum + enc.encode(msg.content).length + 4,
      0,
    );
  }

  getContextWindowSize(model: string): number {
    return fallback.getContextWindowSize(model);
  }

  estimateCost(
    inputTokens: number,
    outputTokens: number,
    model: string,
  ): number {
    return fallback.estimateCost(inputTokens, outputTokens, model);
  }

  truncate(text: string, maxTokens: number, model?: string): string {
    if (!text) return text;
    const enc = this.getEncoding(model);
    if (!enc) return fallback.truncate(text, maxTokens);

    const tokens = enc.encode(text);
    if (tokens.length <= maxTokens) return text;

    // Binary search for the right character cut point
    let low = 0;
    let high = text.length;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (enc.encode(text.slice(0, mid)).length <= maxTokens) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return text.slice(0, low);
  }

  /** Wait for tiktoken to finish loading */
  async waitForInit(): Promise<boolean> {
    await this.initPromise;
    return this.available;
  }

  /** Release cached encodings */
  dispose(): void {
    for (const enc of this.encodingCache.values()) {
      try {
        enc.free();
      } catch {
        // ignore
      }
    }
    this.encodingCache.clear();
  }
}
