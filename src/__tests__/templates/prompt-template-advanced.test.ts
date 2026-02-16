import { describe, it, expect } from "vitest";
import { PromptTemplate } from "../../templates/prompt-template.js";

describe("PromptTemplate Advanced Features", () => {
  describe("conditionals - if/else", () => {
    it("should render content when condition is true", () => {
      const t = new PromptTemplate({ template: "{{#if show}}visible{{/if}}" });
      expect(t.compile({ show: true })).toBe("visible");
    });

    it("should hide content when condition is false", () => {
      const t = new PromptTemplate({ template: "{{#if show}}visible{{/if}}" });
      expect(t.compile({ show: false })).toBe("");
    });

    it("should hide content when condition is null", () => {
      const t = new PromptTemplate({ template: "{{#if show}}visible{{/if}}" });
      expect(t.compile({ show: null })).toBe("");
    });

    it("should hide content when condition is undefined", () => {
      const t = new PromptTemplate({ template: "{{#if show}}visible{{/if}}" });
      expect(t.compile({ show: undefined })).toBe("");
    });

    it("should hide content when condition is empty string", () => {
      const t = new PromptTemplate({ template: "{{#if show}}visible{{/if}}" });
      expect(t.compile({ show: "" })).toBe("");
    });

    it("should hide content when condition is 0", () => {
      const t = new PromptTemplate({ template: "{{#if show}}visible{{/if}}" });
      expect(t.compile({ show: 0 })).toBe("");
    });

    it("should render truthy branch with if/else when true", () => {
      const t = new PromptTemplate({ template: "{{#if active}}yes{{else}}no{{/if}}" });
      expect(t.compile({ active: true })).toBe("yes");
    });

    it("should render falsy branch with if/else when false", () => {
      const t = new PromptTemplate({ template: "{{#if active}}yes{{else}}no{{/if}}" });
      expect(t.compile({ active: false })).toBe("no");
    });

    it("should treat missing variable as falsy in conditional", () => {
      const t = new PromptTemplate({ template: "{{#if missing}}yes{{else}}no{{/if}}" });
      expect(t.compile({})).toBe("no");
    });
  });

  describe("conditionals - unless", () => {
    it("should render content when condition is falsy", () => {
      const t = new PromptTemplate({ template: "{{#unless hidden}}shown{{/unless}}" });
      expect(t.compile({ hidden: false })).toBe("shown");
    });

    it("should hide content when condition is truthy", () => {
      const t = new PromptTemplate({ template: "{{#unless hidden}}shown{{/unless}}" });
      expect(t.compile({ hidden: true })).toBe("");
    });

    it("should render content when condition is missing (undefined)", () => {
      const t = new PromptTemplate({ template: "{{#unless hidden}}shown{{/unless}}" });
      expect(t.compile({})).toBe("shown");
    });

    it("should support {{else}} with falsy condition", () => {
      const t = new PromptTemplate({ template: "{{#unless hidden}}A{{else}}B{{/unless}}" });
      expect(t.compile({ hidden: false })).toBe("A");
    });

    it("should support {{else}} with truthy condition", () => {
      const t = new PromptTemplate({ template: "{{#unless hidden}}A{{else}}B{{/unless}}" });
      expect(t.compile({ hidden: true })).toBe("B");
    });
  });

  describe("loops - each", () => {
    it("should iterate over string array with {{this}}", () => {
      const t = new PromptTemplate({ template: "{{#each items}}{{this}} {{/each}}" });
      expect(t.compile({ items: ["a", "b", "c"] })).toBe("a b c ");
    });

    it("should iterate over object array with {{this.property}}", () => {
      const t = new PromptTemplate({ template: "{{#each users}}{{this.name}} {{/each}}" });
      expect(t.compile({ users: [{ name: "Alice" }, { name: "Bob" }] })).toBe("Alice Bob ");
    });

    it("should handle empty array", () => {
      const t = new PromptTemplate({ template: "{{#each items}}{{this}}{{/each}}" });
      expect(t.compile({ items: [] })).toBe("");
    });

    it("should handle missing array variable as empty", () => {
      const t = new PromptTemplate({ template: "{{#each items}}{{this}}{{/each}}" });
      expect(t.compile({})).toBe("");
    });

    it("should provide @index (0-based)", () => {
      const t = new PromptTemplate({ template: "{{#each items}}{{@index}}:{{this}} {{/each}}" });
      expect(t.compile({ items: ["x", "y", "z"] })).toBe("0:x 1:y 2:z ");
    });

    it("should access multiple object properties", () => {
      const t = new PromptTemplate({
        template: "{{#each people}}{{this.name}} is {{this.age}}. {{/each}}"
      });
      expect(t.compile({
        people: [{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]
      })).toBe("Alice is 30. Bob is 25. ");
    });

    it("should not bleed outer {{this}}/{{@index}} into nested {{#each}}", () => {
      const t = new PromptTemplate({
        template: "{{#each outer}}[{{#each inner}}{{this}}{{/each}}]{{/each}}"
      });
      expect(t.compile({ outer: ["a", "b"], inner: ["1", "2"] })).toBe("[12][12]");
    });
  });

  describe("filters", () => {
    it("should apply uppercase filter", () => {
      const t = new PromptTemplate({ template: "{{name | uppercase}}" });
      expect(t.compile({ name: "hello" })).toBe("HELLO");
    });

    it("should apply lowercase filter", () => {
      const t = new PromptTemplate({ template: "{{name | lowercase}}" });
      expect(t.compile({ name: "HELLO" })).toBe("hello");
    });

    it("should apply trim filter", () => {
      const t = new PromptTemplate({ template: "{{name | trim}}" });
      expect(t.compile({ name: "  hello  " })).toBe("hello");
    });

    it("should apply json filter", () => {
      const t = new PromptTemplate({ template: "{{name | json}}" });
      expect(t.compile({ name: "hello" })).toBe('"hello"');
    });

    it("should apply default filter with fallback", () => {
      const t = new PromptTemplate({ template: "{{name | default('unknown')}}" });
      expect(t.compile({ name: undefined })).toBe("unknown");
    });

    it("should not apply default filter when value exists", () => {
      const t = new PromptTemplate({ template: "{{name | default('unknown')}}" });
      expect(t.compile({ name: "Alice" })).toBe("Alice");
    });

    it("should chain multiple filters", () => {
      const t = new PromptTemplate({ template: "{{name | trim | uppercase}}" });
      expect(t.compile({ name: "  hello  " })).toBe("HELLO");
    });
  });

  describe("nested constructs", () => {
    it("should support if inside each", () => {
      const t = new PromptTemplate({
        template: "{{#each items}}{{#if show}}{{this}}{{/if}}{{/each}}"
      });
      expect(t.compile({ items: ["a", "b"], show: true })).toBe("ab");
    });

    it("should support if inside each with falsy condition", () => {
      const t = new PromptTemplate({
        template: "{{#each items}}{{#if show}}{{this}}{{/if}}{{/each}}"
      });
      expect(t.compile({ items: ["a", "b"], show: false })).toBe("");
    });

    it("should support each inside if", () => {
      const t = new PromptTemplate({
        template: "{{#if show}}{{#each items}}{{this}} {{/each}}{{/if}}"
      });
      expect(t.compile({ show: true, items: ["x", "y"] })).toBe("x y ");
    });

    it("should hide each when if is falsy", () => {
      const t = new PromptTemplate({
        template: "{{#if show}}{{#each items}}{{this}} {{/each}}{{/if}}"
      });
      expect(t.compile({ show: false, items: ["x", "y"] })).toBe("");
    });
  });

  describe("filter edge cases (R5 fixes)", () => {
    it("requiredVariables includes variables from filter expressions", () => {
      const t = new PromptTemplate({ template: "{{name | uppercase}}" });
      expect(t.requiredVariables).toContain("name");
    });

    it("filter with pipe in argument uses the default", () => {
      const t = new PromptTemplate({ template: "{{x | default('a|b')}}" });
      expect(t.compile({ x: undefined })).toBe("a|b");
    });

    it("missing filter variable throws an error", () => {
      const t = new PromptTemplate({ template: "{{missing | uppercase}}" });
      expect(() => t.compile({})).toThrow('Required variable "missing" is missing');
    });
  });

  describe("combination with existing features", () => {
    it("should work with partials and conditionals", () => {
      const greeting = PromptTemplate.from("Hello!");
      const t = new PromptTemplate({
        template: "{{#if formal}}{{>greeting}}{{else}}Hey!{{/if}}",
        partials: { greeting }
      });
      expect(t.compile({ formal: true })).toBe("Hello!");
      expect(t.compile({ formal: false })).toBe("Hey!");
    });

    it("should work with variables alongside conditionals", () => {
      const t = new PromptTemplate({
        template: "Hi {{name}}! {{#if premium}}Welcome back!{{/if}}"
      });
      expect(t.compile({ name: "Alice", premium: true })).toBe("Hi Alice! Welcome back!");
      expect(t.compile({ name: "Bob", premium: false })).toBe("Hi Bob! ");
    });

    it("should work with filters and conditionals together", () => {
      const t = new PromptTemplate({
        template: "{{#if show}}{{name | uppercase}}{{/if}}"
      });
      expect(t.compile({ show: true, name: "alice" })).toBe("ALICE");
    });
  });
});
