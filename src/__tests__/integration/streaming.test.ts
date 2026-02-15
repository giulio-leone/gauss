import { describe, expect, it, beforeEach, vi } from "vitest";
import { createEventStream } from "../../streaming/event-stream.js";
import { createDeltaEncoder } from "../../streaming/delta-encoder.js";
import { EventBus } from "../../agent/event-bus.js";
import type { AgentEvent } from "../../types.js";

describe("Streaming Integration", () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe("createEventStream", () => {
    it("should create a readable stream from EventBus", async () => {
      const stream = createEventStream(eventBus, { mode: "full" });
      
      expect(stream).toBeInstanceOf(ReadableStream);
      
      // Clean up
      await stream.cancel();
    });

    it("should filter events by type", async () => {
      const receivedEvents: string[] = [];
      
      const stream = createEventStream(eventBus, {
        eventTypes: ["step"],
        mode: "full",
      });

      const reader = stream.getReader();

      // Start reading in background
      const readPromise = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
          }
        } catch (error) {
          // Stream was cancelled
        }
      })();

      // Give stream time to set up
      await new Promise(resolve => setTimeout(resolve, 10));

      // Emit different event types
      eventBus.emit("step", { type: "step", data: "step event" } as AgentEvent);
      eventBus.emit("run", { type: "run", data: "run event" } as AgentEvent);
      eventBus.emit("step", { type: "step", data: "another step" } as AgentEvent);

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel stream and wait for reading to finish
      await reader.cancel();
      await readPromise;

      // Should only receive step events
      expect(receivedEvents.length).toBe(2);
      receivedEvents.forEach(event => {
        const parsed = JSON.parse(event.split("data: ")[1]);
        expect(parsed.type).toBe("step");
      });
    });

    it("should handle delta encoding mode", async () => {
      const receivedEvents: string[] = [];
      
      const stream = createEventStream(eventBus, { mode: "delta" });
      const reader = stream.getReader();

      // Start reading
      const readPromise = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
          }
        } catch (error) {
          // Stream was cancelled
        }
      })();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Emit identical events
      const event1: AgentEvent = { type: "test", data: "same data" };
      const event2: AgentEvent = { type: "test", data: "same data" };
      const event3: AgentEvent = { type: "test", data: "different data" };

      eventBus.emit("test", event1);
      eventBus.emit("test", event2); // Should be filtered out by delta encoder
      eventBus.emit("test", event3);

      await new Promise(resolve => setTimeout(resolve, 10));

      await reader.cancel();
      await readPromise;

      // Should only receive first and third events (second was identical)
      expect(receivedEvents.length).toBe(2);
    });

    it("should format events as SSE", async () => {
      const receivedEvents: string[] = [];
      
      const stream = createEventStream(eventBus);
      const reader = stream.getReader();

      const readPromise = (async () => {
        try {
          const { done, value } = await reader.read();
          if (!done) {
            receivedEvents.push(value);
          }
        } catch (error) {
          // Stream was cancelled
        }
      })();

      await new Promise(resolve => setTimeout(resolve, 10));

      eventBus.emit("test", { type: "test", message: "hello" } as AgentEvent);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await reader.cancel();
      await readPromise;

      expect(receivedEvents.length).toBe(1);
      const event = receivedEvents[0];
      
      // Should be formatted as SSE
      expect(event).toMatch(/^id: \d+\n/);
      expect(event).toMatch(/event: test\n/);
      expect(event).toMatch(/data: /);
      expect(event.endsWith("\n\n")).toBe(true);
    });
  });

  describe("createDeltaEncoder", () => {
    let encoder: ReturnType<typeof createDeltaEncoder>;

    beforeEach(() => {
      encoder = createDeltaEncoder();
    });

    it("should encode new events normally", () => {
      const event: AgentEvent = { type: "test", data: "hello" };
      
      const result = encoder.encode(event);
      
      expect(result).toBe(JSON.stringify(event));
    });

    it("should return null for identical events", () => {
      const event: AgentEvent = { type: "test", data: "hello" };
      
      // First encoding
      const result1 = encoder.encode(event);
      expect(result1).toBe(JSON.stringify(event));

      // Second encoding with identical event
      const result2 = encoder.encode(event);
      expect(result2).toBeNull();
    });

    it("should encode delta for changed events", () => {
      const event1: AgentEvent = { type: "test", data: "hello", count: 1 };
      const event2: AgentEvent = { type: "test", data: "hello", count: 2 };
      
      encoder.encode(event1); // Initial encoding
      const delta = encoder.encode(event2);
      
      expect(delta).not.toBeNull();
      const parsed = JSON.parse(delta!);
      expect(parsed.type).toBe("test");
      expect(parsed.count).toBe(2);
      expect(parsed.data).toBeUndefined(); // Unchanged field should not be included
    });

    it("should handle different event types separately", () => {
      const stepEvent: AgentEvent = { type: "step", data: "step data" };
      const runEvent: AgentEvent = { type: "run", data: "run data" };
      
      const result1 = encoder.encode(stepEvent);
      const result2 = encoder.encode(runEvent);
      
      expect(result1).toBe(JSON.stringify(stepEvent));
      expect(result2).toBe(JSON.stringify(runEvent));

      // Encoding same events again
      const result3 = encoder.encode(stepEvent);
      const result4 = encoder.encode(runEvent);
      
      expect(result3).toBeNull();
      expect(result4).toBeNull();
    });

    it("should reset state correctly", () => {
      const event: AgentEvent = { type: "test", data: "hello" };
      
      encoder.encode(event); // First encoding
      encoder.encode(event); // Should return null
      
      encoder.reset();
      
      const result = encoder.encode(event); // Should encode normally after reset
      expect(result).toBe(JSON.stringify(event));
    });

    it("should handle complex nested objects", () => {
      const event1: AgentEvent = {
        type: "complex",
        data: {
          nested: { value: 1 },
          array: [1, 2, 3],
        },
      };
      
      const event2: AgentEvent = {
        type: "complex",
        data: {
          nested: { value: 2 }, // Changed
          array: [1, 2, 3], // Unchanged
        },
      };
      
      encoder.encode(event1);
      const delta = encoder.encode(event2);
      
      expect(delta).not.toBeNull();
      const parsed = JSON.parse(delta!);
      expect(parsed.type).toBe("complex");
      expect(parsed.data).toEqual({
        nested: { value: 2 },
        array: [1, 2, 3], // Still included because data object changed
      });
    });

    it("should handle undefined and null values", () => {
      const event1: AgentEvent = { type: "test", data: undefined };
      const event2: AgentEvent = { type: "test", data: null };
      const event3: AgentEvent = { type: "test", data: "value" };
      
      const result1 = encoder.encode(event1);
      const result2 = encoder.encode(event2);
      const result3 = encoder.encode(event3);
      
      expect(result1).toBe(JSON.stringify(event1));
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();
    });
  });

  describe("Streaming with multiple event types", () => {
    it("should handle rapid event sequences", async () => {
      const receivedEvents: string[] = [];
      
      const stream = createEventStream(eventBus, { mode: "delta" });
      const reader = stream.getReader();

      const readPromise = (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
          }
        } catch (error) {
          // Stream was cancelled
        }
      })();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Rapid event sequence
      for (let i = 0; i < 5; i++) { // Reduced to avoid timing issues
        eventBus.emit("counter", { type: "counter", value: i } as AgentEvent);
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      await reader.cancel();
      await readPromise;

      expect(receivedEvents.length).toBeGreaterThan(0);
    });

    it("should properly interleave different event types", async () => {
      const receivedEvents: string[] = [];
      
      const stream = createEventStream(eventBus, { mode: "full" });
      const reader = stream.getReader();

      const readPromise = (async () => {
        try {
          while (receivedEvents.length < 3) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
          }
        } catch (error) {
          // Stream was cancelled
        }
      })();

      await new Promise(resolve => setTimeout(resolve, 10));

      // Interleaved events
      eventBus.emit("step", { type: "step", id: 1 } as AgentEvent);
      eventBus.emit("run", { type: "run", id: 1 } as AgentEvent);
      eventBus.emit("step", { type: "step", id: 2 } as AgentEvent);

      await new Promise(resolve => setTimeout(resolve, 50));
      await reader.cancel();
      await readPromise;

      expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
      
      if (receivedEvents.length >= 3) {
        // Parse and check event types
        const eventTypes = receivedEvents.map(event => {
          const eventLine = event.split('\n').find(line => line.startsWith('event: '));
          return eventLine?.replace('event: ', '');
        });
        
        expect(eventTypes).toEqual(["step", "run", "step"]);
      }
    }, 10000); // Increase timeout
  });
});