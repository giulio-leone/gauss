import { describe, it, expect } from "vitest";
import { createRuntimeAdapterAsync } from "../detect-runtime.js";

describe("createRuntimeAdapterAsync — lazy loading", () => {
  it("returns a Promise", () => {
    const result = createRuntimeAdapterAsync();
    expect(result).toBeInstanceOf(Promise);
  });

  it("resolves to a RuntimePort-compatible object", async () => {
    const adapter = await createRuntimeAdapterAsync();
    expect(typeof adapter.randomUUID).toBe("function");
    expect(typeof adapter.fetch).toBe("function");
    expect(typeof adapter.getEnv).toBe("function");
    expect(typeof adapter.setTimeout).toBe("function");
  });
});
