// =============================================================================
// LLMRecorder — Record all LLM calls for replay and testing
// =============================================================================

import type { LanguageModel } from "../core/llm/index.js";
import { generateText } from "../core/llm/index.js";
import * as fs from "node:fs";
import * as path from "node:path";

// =============================================================================
// Types
// =============================================================================

export interface LLMCallRecord {
  id: string;
  timestamp: string;
  model: string;
  input: {
    prompt?: string;
    messages?: unknown[];
    system?: string;
  };
  output: {
    text: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    finishReason?: string;
  };
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface RecorderOptions {
  outputPath?: string;
  format?: "jsonl" | "json";
  captureMetadata?: boolean;
}

export interface ReplayerOptions {
  strict?: boolean; // throw if no matching record found
}

// =============================================================================
// LLMRecorder — Wraps model calls and records inputs/outputs
// =============================================================================

export class LLMRecorder {
  private records: LLMCallRecord[] = [];
  private callCount = 0;
  private outputPath?: string;
  private format: "jsonl" | "json";
  private captureMetadata: boolean;

  constructor(options: RecorderOptions = {}) {
    this.outputPath = options.outputPath;
    this.format = options.format ?? "jsonl";
    this.captureMetadata = options.captureMetadata ?? true;
  }

  /** Record a single LLM call */
  async record(params: {
    model: LanguageModel;
    prompt?: string;
    messages?: unknown[];
    system?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ text: string; record: LLMCallRecord }> {
    const startMs = Date.now();
    const id = `call-${++this.callCount}`;

    const result = await (generateText as any)({
      model: params.model,
      prompt: params.prompt,
      system: params.system,
    });

    const durationMs = Date.now() - startMs;

    const record: LLMCallRecord = {
      id,
      timestamp: new Date(startMs).toISOString(),
      model:
        typeof params.model === "string"
          ? params.model
          : params.model.modelId ?? "unknown",
      input: {
        prompt: params.prompt,
        messages: params.messages,
        system: params.system,
      },
      output: {
        text: result.text,
        usage: result.usage
          ? {
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
            }
          : undefined,
        finishReason: result.finishReason,
      },
      durationMs,
      metadata: this.captureMetadata ? params.metadata : undefined,
    };

    this.records.push(record);
    return { text: result.text, record };
  }

  /** Get all recorded calls */
  getRecords(): LLMCallRecord[] {
    return [...this.records];
  }

  /** Save records to disk */
  async save(outputPath?: string): Promise<string> {
    const filePath = outputPath ?? this.outputPath ?? "llm-recordings.jsonl";
    const dir = path.dirname(filePath);
    if (dir !== ".") {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (this.format === "jsonl") {
      const content = this.records.map((r) => JSON.stringify(r)).join("\n") + "\n";
      fs.writeFileSync(filePath, content, "utf-8");
    } else {
      fs.writeFileSync(filePath, JSON.stringify(this.records, null, 2), "utf-8");
    }
    return filePath;
  }

  /** Clear all records */
  clear(): void {
    this.records = [];
    this.callCount = 0;
  }
}

// =============================================================================
// LLMReplayer — Replay recorded LLM calls for deterministic testing
// =============================================================================

export class LLMReplayer {
  private records: LLMCallRecord[] = [];
  private index = 0;
  private strict: boolean;

  constructor(options: ReplayerOptions = {}) {
    this.strict = options.strict ?? true;
  }

  /** Load records from a JSONL file */
  loadFromFile(filePath: string): void {
    const content = fs.readFileSync(filePath, "utf-8");
    if (filePath.endsWith(".json")) {
      this.records = JSON.parse(content);
    } else {
      this.records = content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
    this.index = 0;
  }

  /** Load records from an in-memory array */
  loadFromRecords(records: LLMCallRecord[]): void {
    this.records = [...records];
    this.index = 0;
  }

  /** Replay the next recorded response */
  next(): LLMCallRecord {
    if (this.index >= this.records.length) {
      if (this.strict) {
        throw new Error(
          `LLMReplayer: no more records (exhausted ${this.records.length} recordings)`
        );
      }
      return this.records[this.records.length - 1];
    }
    return this.records[this.index++];
  }

  /** Find a matching record by prompt */
  findByPrompt(prompt: string): LLMCallRecord | undefined {
    return this.records.find((r) => r.input.prompt === prompt);
  }

  /** Find a matching record by model and prompt */
  findByModelAndPrompt(
    model: string,
    prompt: string
  ): LLMCallRecord | undefined {
    return this.records.find(
      (r) => r.model === model && r.input.prompt === prompt
    );
  }

  /** Check if more records are available */
  hasMore(): boolean {
    return this.index < this.records.length;
  }

  /** Reset replay to the beginning */
  reset(): void {
    this.index = 0;
  }

  /** Get total number of records */
  get count(): number {
    return this.records.length;
  }
}
