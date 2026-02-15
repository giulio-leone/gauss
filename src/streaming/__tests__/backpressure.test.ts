import { describe, it, expect } from "vitest";
import { createEventStream } from "../event-stream.js";
import { EventBus } from "../../agent/event-bus.js";

describe("EventStream — backpressure", () => {
  it("exposes backpressureStrategy and bufferSize options without error", () => {
    const bus = new EventBus("s1");
    const stream = createEventStream(bus, {
      backpressureStrategy: "buffer",
      bufferSize: 50,
    });
    expect(stream).toBeInstanceOf(ReadableStream);
    stream.cancel();
  });

  it("defaults to drop strategy (backward compat)", async () => {
    const bus = new EventBus("s1");
    const stream = createEventStream(bus);

    queueMicrotask(() => bus.emit("agent:start", { prompt: "hi" }));

    const reader = stream.getReader();
    const { value } = await reader.read();
    expect(value).toContain("event: agent:start");
    reader.releaseLock();
    await stream.cancel();
  });

  it("buffer strategy option is accepted", () => {
    const bus = new EventBus("s1");
    const stream = createEventStream(bus, {
      backpressureStrategy: "buffer",
      bufferSize: 10,
    });
    expect(stream).toBeInstanceOf(ReadableStream);
    stream.cancel();
  });
});
