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

/**
 * Transform a raw NAPI result into the public {@link AgentResult} shape.
 *
 * @param raw - Raw result object from the NAPI layer.
 * @returns Normalised {@link AgentResult}.
 * @internal
 */
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

/**
 * A single event emitted during agent streaming.
 *
 * @description Represents a parsed streaming event such as a text delta, tool call,
 * or other provider-specific event. The `type` field discriminates the event kind.
 *
 * @example
 * ```ts
 * const event: StreamEvent = { type: "text_delta", text: "Hello" };
 * if (event.type === "text_delta") process.stdout.write(event.text ?? "");
 * ```
 *
 * @since 1.0.0
 */
export interface StreamEvent {
  /** The event type discriminator (e.g. `"text_delta"`, `"tool_call"`, `"raw"`). */
  type: string;
  /** Text content for text-delta events. */
  text?: string;
  /** Tool call payload for tool-call events. */
  toolCall?: { name: string; arguments: string };
  /** Additional provider-specific fields. */
  [key: string]: unknown;
}

/**
 * Async iterable wrapper over the native agent streaming callback.
 *
 * @description Bridges the native callback-based streaming API into an `AsyncIterable<StreamEvent>`.
 * Use with `for await ... of` to consume events as they arrive. After iteration completes,
 * the final {@link AgentResult} is available via the {@link AgentStream.result} getter.
 *
 * @example
 * ```ts
 * const stream = agent.streamIter("Tell me a story");
 * for await (const event of stream) {
 *   if (event.type === "text_delta") process.stdout.write(event.text ?? "");
 * }
 * console.log(stream.result?.text);
 * ```
 *
 * @since 1.0.0
 */
export class AgentStream implements AsyncIterable<StreamEvent> {
  private _result: AgentResult | undefined;

  /**
   * Create a new `AgentStream`.
   *
   * @description Typically not called directly — use {@link Agent.streamIter} instead.
   *
   * @param agentName - Name of the agent for logging/identification.
   * @param providerHandle - Native provider handle.
   * @param tools - Tool definitions available during the stream.
   * @param messages - Conversation messages to send.
   * @param options - Agent options for the agentic loop.
   * @param toolExecutor - Async callback for executing tool calls.
   *
   * @since 1.0.0
   */
  constructor(
    private readonly agentName: string,
    private readonly providerHandle: Handle,
    private readonly tools: ToolDef[],
    private readonly messages: Message[],
    private readonly options: AgentOptions,
    private readonly toolExecutor: ToolExecutor,
  ) {}

  /**
   * The final aggregated result, available after async iteration completes.
   *
   * @description Returns `undefined` while iteration is still in progress. Once the
   * `for await` loop finishes, this contains the full {@link AgentResult} with response
   * text, token counts, and other metadata.
   *
   * @returns The completed {@link AgentResult} or `undefined` if iteration hasn't finished.
   *
   * @example
   * ```ts
   * const stream = agent.streamIter("Hello");
   * for await (const event of stream) { /* consume events *\/ }
   * console.log(stream.result?.text);
   * ```
   *
   * @since 1.0.0
   */
  get result(): AgentResult | undefined { return this._result; }

  /**
   * Async iterator implementation — yields {@link StreamEvent} objects as they arrive.
   *
   * @description Starts the native streaming call and yields parsed events. The iterator
   * completes when the underlying stream finishes and all buffered events have been yielded.
   *
   * @returns An async iterator of {@link StreamEvent} objects.
   *
   * @since 1.0.0
   */
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
