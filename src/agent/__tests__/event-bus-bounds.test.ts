import { describe, it, expect } from "vitest";
import { EventBus } from "../event-bus.js";

describe("EventBus — maxListenersPerEvent", () => {
  it("throws when exceeding maxListenersPerEvent", () => {
    const bus = new EventBus("s1", { maxListenersPerEvent: 2 });
    bus.on("agent:start", () => {});
    bus.on("agent:start", () => {});
    expect(() => bus.on("agent:start", () => {})).toThrowError(
      /max listeners \(2\) reached/,
    );
  });

  it("allows listeners on different event types independently", () => {
    const bus = new EventBus("s1", { maxListenersPerEvent: 1 });
    bus.on("agent:start", () => {});
    bus.on("agent:end", () => {});
    expect(bus.listenerCount("agent:start")).toBe(1);
    expect(bus.listenerCount("agent:end")).toBe(1);
  });

  it("defaults to 100 max listeners", () => {
    const bus = new EventBus("s1");
    for (let i = 0; i < 100; i++) {
      bus.on("agent:start", () => {});
    }
    expect(() => bus.on("agent:start", () => {})).toThrowError(
      /max listeners \(100\) reached/,
    );
  });

  it("allows re-adding after removal", () => {
    const bus = new EventBus("s1", { maxListenersPerEvent: 1 });
    const unsub = bus.on("agent:start", () => {});
    unsub();
    bus.on("agent:start", () => {});
    expect(bus.listenerCount("agent:start")).toBe(1);
  });
});
