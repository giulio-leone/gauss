/**
 * AgentStream — Async iterable wrapper over native streaming.
 *
 * @example
 *   for await (const event of agent.streamIter("Tell me a story", executor)) {
 *     if (event.type === "text_delta") process.stdout.write(event.text ?? "");
 *   }
 *   // Access final result after iteration:
 *   console.log(stream.result?.text);
 */
import { agent_stream_with_tool_executor } from "gauss-napi";

import type {
  ToolDef,
  Message,
  AgentOptions,
  AgentResult,
  ToolExecutor,
  Handle,
} from "./types.js";

/** Transform NAPI result to SDK AgentResult (normalizes citation field names). */
function toSdkResult(raw: any): AgentResult {
  return {
    ...raw,
    citations: raw.citations?.map((c: any) => ({
      type: c.citationType ?? c.type,
      citedText: c.citedText,
      documentTitle: c.documentTitle,
      start: c.start,
      end: c.end,
    })),
  };
}

/** Parsed stream event. */
export interface StreamEvent {
  type: string;
  text?: string;
  toolCall?: { name: string; arguments: string };
  [key: string]: unknown;
}

/**
 * Async iterable wrapper over the native stream callback.
 *
 * @example
 *   for await (const event of agent.streamIter("Tell me a story", executor)) {
 *     if (event.type === "text_delta") process.stdout.write(event.text ?? "");
 *   }
 *   // Access final result after iteration:
 *   const result = stream.result;
 */
export class AgentStream implements AsyncIterable<StreamEvent> {
  private _result: AgentResult | undefined;

  constructor(
    private readonly agentName: string,
    private readonly providerHandle: Handle,
    private readonly tools: ToolDef[],
    private readonly messages: Message[],
    private readonly options: AgentOptions,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  /** Final result — available after iteration completes. */
  get result(): AgentResult | undefined { return this._result; }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamEvent> {
    const buffer: StreamEvent[] = [];
    let resolve: (() => void) | undefined;
    let done = false;

    const onEvent = (json: string) => {
      try {
        buffer.push(JSON.parse(json) as StreamEvent);
      } catch {
        buffer.push({ type: "raw", text: json });
      }
      resolve?.();
    };

    const runPromise = agent_stream_with_tool_executor(
      this.agentName,
      this.providerHandle,
      this.tools,
      this.messages,
      this.options,
      onEvent,
      this.toolExecutor
    ).then((r) => {
      this._result = toSdkResult(r);
      done = true;
      resolve?.();
    });

    while (!done || buffer.length > 0) {
      if (buffer.length > 0) {
        yield buffer.shift()!;
      } else if (!done) {
        await new Promise<void>((r) => { resolve = r; });
      }
    }

    await runPromise;
  }
}
