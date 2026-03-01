import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../tool-registry.js";

describe("ToolRegistry", () => {
  it("creates and destroys without error", () => {
    const reg = new ToolRegistry();
    expect(reg.handle).toBeGreaterThanOrEqual(0);
    reg.destroy();
  });

  it("add returns this for chaining", () => {
    const reg = new ToolRegistry();
    const result = reg
      .add({ name: "a", description: "Tool A" })
      .add({ name: "b", description: "Tool B" });
    expect(result).toBe(reg);
    reg.destroy();
  });

  it("list returns all registered tools", () => {
    const reg = new ToolRegistry();
    reg.add({ name: "calc", description: "Calculator", tags: ["math"] });
    reg.add({ name: "weather", description: "Get weather", tags: ["api"] });
    const tools = reg.list();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("calc");
    expect(tools[1].name).toBe("weather");
    reg.destroy();
  });

  it("search by name", () => {
    const reg = new ToolRegistry();
    reg.add({ name: "calculator", description: "Math calculator", tags: ["math"] });
    reg.add({ name: "weather", description: "Get weather", tags: ["api"] });
    const results = reg.search("calc");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("calculator");
    reg.destroy();
  });

  it("search by description", () => {
    const reg = new ToolRegistry();
    reg.add({ name: "add", description: "Add two numbers together" });
    reg.add({ name: "concat", description: "Concatenate strings" });
    const results = reg.search("numbers");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("add");
    reg.destroy();
  });

  it("search by tag", () => {
    const reg = new ToolRegistry();
    reg.add({ name: "calc", description: "Calc", tags: ["math", "utility"] });
    reg.add({ name: "plot", description: "Plot", tags: ["math", "viz"] });
    const results = reg.search("math");
    expect(results).toHaveLength(2);
    reg.destroy();
  });

  it("byTag filters by exact tag", () => {
    const reg = new ToolRegistry();
    reg.add({ name: "a", description: "A", tags: ["alpha", "beta"] });
    reg.add({ name: "b", description: "B", tags: ["beta"] });
    reg.add({ name: "c", description: "C", tags: ["gamma"] });
    expect(reg.byTag("beta")).toHaveLength(2);
    expect(reg.byTag("gamma")).toHaveLength(1);
    expect(reg.byTag("delta")).toHaveLength(0);
    reg.destroy();
  });

  it("add with examples", () => {
    const reg = new ToolRegistry();
    reg.add({
      name: "add",
      description: "Add numbers",
      examples: [
        {
          description: "Add 2 + 3",
          input: { a: 2, b: 3 },
          expectedOutput: 5,
        },
      ],
    });
    const tools = reg.list();
    expect(tools[0].examples).toHaveLength(1);
    reg.destroy();
  });

  it("search returns empty for no match", () => {
    const reg = new ToolRegistry();
    reg.add({ name: "calc", description: "Calculator" });
    expect(reg.search("nonexistent")).toHaveLength(0);
    reg.destroy();
  });

  it("throws after destroy", () => {
    const reg = new ToolRegistry();
    reg.destroy();
    expect(() => reg.add({ name: "x", description: "x" })).toThrow(
      "ToolRegistry has been destroyed",
    );
    expect(() => reg.search("x")).toThrow("destroyed");
    expect(() => reg.list()).toThrow("destroyed");
  });

  it("supports Symbol.dispose", () => {
    const reg = new ToolRegistry();
    reg[Symbol.dispose]();
    expect(() => reg.add({ name: "x", description: "x" })).toThrow();
  });
});
