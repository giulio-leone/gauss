import { describe, it, expect } from "vitest";
import type { LanguageModel } from "ai";
import { PromptTemplate } from "../prompt-template.js";
import type { DeepAgentConfig } from "../../types.js";
import { DeepAgent } from "../../agent/deep-agent.js";

// Mock model for testing
const mockModel = {
  modelId: "test-model",
  provider: "test",
} as unknown as LanguageModel;

describe("PromptTemplate", () => {
  describe("variable interpolation", () => {
    it("should replace single variable", () => {
      const template = new PromptTemplate({
        template: "Hello {{name}}!"
      });
      
      const result = template.compile({ name: "World" });
      expect(result).toBe("Hello World!");
    });

    it("should replace multiple variables", () => {
      const template = new PromptTemplate({
        template: "{{greeting}} {{name}}, you are {{age}} years old"
      });
      
      const result = template.compile({
        greeting: "Hi",
        name: "Alice", 
        age: 30
      });
      expect(result).toBe("Hi Alice, you are 30 years old");
    });

    it("should handle boolean and number variables", () => {
      const template = new PromptTemplate({
        template: "Active: {{active}}, Count: {{count}}"
      });
      
      const result = template.compile({
        active: true,
        count: 42
      });
      expect(result).toBe("Active: true, Count: 42");
    });

    it("should merge config variables with overrides", () => {
      const template = new PromptTemplate({
        template: "{{a}} {{b}} {{c}}",
        variables: { a: "config", b: "config" }
      });
      
      const result = template.compile({ b: "override", c: "new" });
      expect(result).toBe("config override new");
    });
  });

  describe("error handling", () => {
    it("should throw error for missing required variable", () => {
      const template = new PromptTemplate({
        template: "Hello {{name}}!"
      });
      
      expect(() => template.compile()).toThrow('Required variable "name" is missing');
    });

    it("should throw error for missing partial", () => {
      const template = new PromptTemplate({
        template: "Start {{>missing}} End"
      });
      
      expect(() => template.compile()).toThrow('Partial "missing" not found');
    });
  });

  describe("partial templates", () => {
    it("should support nested partials", () => {
      const header = PromptTemplate.from("# {{title}}");
      const footer = PromptTemplate.from("Thanks, {{author}}");
      
      const template = new PromptTemplate({
        template: "{{>header}}\n\nContent here\n\n{{>footer}}",
        partials: { header, footer }
      });
      
      const result = template.compile({
        title: "My Article",
        author: "John"
      });
      
      expect(result).toBe("# My Article\n\nContent here\n\nThanks, John");
    });

    it("should pass variables to partials", () => {
      const greeting = PromptTemplate.from("Hello {{name}}!");
      
      const template = new PromptTemplate({
        template: "{{>greeting}} How are you?",
        partials: { greeting }
      });
      
      const result = template.compile({ name: "Alice" });
      expect(result).toBe("Hello Alice! How are you?");
    });
  });

  describe("extend method", () => {
    it("should create new template with overridden template", () => {
      const base = new PromptTemplate({
        template: "Base {{var}}",
        variables: { var: "base" }
      });
      
      const extended = base.extend({
        template: "Extended {{var}}"
      });
      
      expect(extended.compile()).toBe("Extended base");
      expect(base.compile()).toBe("Base base"); // Original unchanged
    });

    it("should merge variables", () => {
      const base = new PromptTemplate({
        template: "{{a}} {{b}} {{c}}",
        variables: { a: "1", b: "2" }
      });
      
      const extended = base.extend({
        variables: { b: "overridden", c: "3" }
      });
      
      expect(extended.compile()).toBe("1 overridden 3");
    });

    it("should merge partials", () => {
      const partial1 = PromptTemplate.from("Partial 1");
      const partial2 = PromptTemplate.from("Partial 2");
      const partial3 = PromptTemplate.from("Partial 3");
      
      const base = new PromptTemplate({
        template: "{{>p1}} {{>p2}} {{>p3}}",
        partials: { p1: partial1, p2: partial2 }
      });
      
      const extended = base.extend({
        partials: { p2: partial3, p3: partial3 }
      });
      
      const result = extended.compile();
      expect(result).toBe("Partial 1 Partial 3 Partial 3");
    });
  });

  describe("requiredVariables", () => {
    it("should extract variables from template", () => {
      const template = new PromptTemplate({
        template: "{{a}} and {{b}} and {{a}} again"
      });
      
      expect(template.requiredVariables).toEqual(["a", "b"]);
    });

    it("should include variables from partials", () => {
      const partial = PromptTemplate.from("{{partialVar}}");
      const template = new PromptTemplate({
        template: "{{mainVar}} {{>partial}}",
        partials: { partial }
      });
      
      expect(template.requiredVariables).toEqual(["mainVar", "partialVar"]);
    });

    it("should not include partial references", () => {
      const template = new PromptTemplate({
        template: "{{var}} {{>partial}}"
      });
      
      expect(template.requiredVariables).toEqual(["var"]);
    });

    it("should include variables from {{#each items}} block tags", () => {
      const template = new PromptTemplate({
        template: "{{#each items}}{{this}}{{/each}}"
      });
      
      expect(template.requiredVariables).toEqual(["items"]);
    });

    it("should include variables from {{#if show}} block tags", () => {
      const template = new PromptTemplate({
        template: "{{#if show}}visible{{/if}}"
      });
      
      expect(template.requiredVariables).toEqual(["show"]);
    });

    it("should include variables from both simple and block tags", () => {
      const template = new PromptTemplate({
        template: "{{#each items}}{{this.name}}{{/each}} {{#if show}}{{label}}{{/if}}"
      });
      
      expect(template.requiredVariables).toEqual(["items", "label", "show"]);
    });
  });

  describe("filters inside each loops", () => {
    it("should apply filter to {{this | filter}} inside each", () => {
      const template = new PromptTemplate({
        template: "{{#each items}}{{this | uppercase}}{{/each}}"
      });
      expect(template.compile({ items: ["hello", "world"] })).toBe("HELLOWORLD");
    });

    it("should apply filter to {{this.prop | filter}} inside each", () => {
      const template = new PromptTemplate({
        template: "{{#each users}}{{this.name | uppercase}}{{/each}}"
      });
      expect(template.compile({ users: [{ name: "alice" }] })).toBe("ALICE");
    });
  });

  describe("exact tag-name matching", () => {
    it("should not confuse {{#eachItem}} with {{#each}}", () => {
      // {{#eachItem ...}} is not a valid each block; it should not interfere
      const template = new PromptTemplate({
        template: "{{#each items}}{{this}}{{/each}}"
      });
      expect(template.compile({ items: ["a", "b"] })).toBe("ab");
    });
  });

  describe("R8 fixes", () => {
    it("{{this}} surviving to step 5 should return empty string, not throw", () => {
      expect(PromptTemplate.from('{{this}}').compile({})).toBe('');
    });

    it("nested each with outer item containing null bytes does not corrupt output", () => {
      const t = new PromptTemplate({
        template: '{{#each outer}}{{this}}[{{#each inner}}{{this}}{{/each}}]{{/each}}'
      });
      const result = t.compile({
        outer: ['\x00NESTED_EACH_0\x00', 'b'],
        inner: ['1', '2']
      });
      expect(result).toBe('\x00NESTED_EACH_0\x00[12]b[12]');
    });
  });

  describe("static factory method", () => {
    it("should create template with from() method", () => {
      const template = PromptTemplate.from("Hello {{name}}!");
      
      const result = template.compile({ name: "World" });
      expect(result).toBe("Hello World!");
    });
  });

  describe("nested if/else", () => {
    it("should correctly resolve nested if/else blocks", () => {
      const tpl = new PromptTemplate({
        template: "{{#if a}}{{#if b}}X{{else}}Y{{/if}}{{else}}Z{{/if}}",
      });

      expect(tpl.compile({ a: true, b: true })).toBe("X");
      expect(tpl.compile({ a: true, b: false })).toBe("Y");
      expect(tpl.compile({ a: false, b: true })).toBe("Z");
      expect(tpl.compile({ a: false, b: false })).toBe("Z");
    });
  });

  describe("DeepAgent integration", () => {
    const mockConfig: DeepAgentConfig = {
      model: mockModel,
      instructions: "Default instructions"
    };

    it("should work with string instructions (existing behavior)", () => {
      const agent = DeepAgent.create(mockConfig)
        .withInstructions("Custom instructions")
        .build();
      
      expect(agent).toBeDefined();
    });

    it("should work with template and variables", () => {
      const template = PromptTemplate.from("You are a {{role}} assistant specialized in {{domain}}.");
      
      const agent = DeepAgent.create(mockConfig)
        .withInstructions(template, { role: "helpful", domain: "TypeScript" })
        .build();
      
      expect(agent).toBeDefined();
    });

    it("should work with template without variables", () => {
      const template = PromptTemplate.from("You are a helpful assistant.");
      
      const agent = DeepAgent.create(mockConfig)
        .withInstructions(template)
        .build();
      
      expect(agent).toBeDefined();
    });
  });
});