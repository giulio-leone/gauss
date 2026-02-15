import { describe, it, expect } from "vitest";
import { AbstractBuilder } from "../abstract-builder.js";

class TestBuilder extends AbstractBuilder<{ value: number }> {
  private value?: number;

  withValue(v: number): this {
    this.value = v;
    return this;
  }

  protected validate(): void {
    if (this.value === undefined) throw new Error("value is required");
  }

  protected construct(): { value: number } {
    return { value: this.value! };
  }
}

describe("AbstractBuilder", () => {
  it("should build when valid", () => {
    const result = new TestBuilder().withValue(42).build();
    expect(result).toEqual({ value: 42 });
  });

  it("should throw when validation fails", () => {
    expect(() => new TestBuilder().build()).toThrow("value is required");
  });
});
