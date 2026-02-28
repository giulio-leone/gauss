import { describe, it, expect } from "vitest";
import { detectRuntime, detectCapabilities, type RuntimeId, type RuntimeCapabilities } from "../detect.js";

describe("detectRuntime", () => {
  it("returns 'node'", () => {
    const result: RuntimeId = detectRuntime();
    expect(result).toBe("node");
  });
});

describe("detectCapabilities", () => {
  it("returns correct capabilities for Node.js", () => {
    const caps: RuntimeCapabilities = detectCapabilities();
    expect(caps.runtime).toBe("node");
    expect(caps.hasNativeFs).toBe(true);
    expect(caps.hasFetch).toBe(true);
    expect(caps.hasWebCrypto).toBe(true);
  });

  it("returns same reference on repeated calls", () => {
    const a = detectCapabilities();
    const b = detectCapabilities();
    expect(a).toBe(b);
  });
});
