import { describe, expect, it, vi, beforeEach } from "vitest";
import { VectorlessPlugin } from "../vectorless.plugin.js";

const mockKnowledge = {
  entities: [
    { name: "TypeScript", type: "Language" },
    { name: "React", type: "Framework" },
  ],
  relations: [
    { from: "React", to: "TypeScript", type: "uses" },
  ],
  quotes: [
    { text: "Hello world" },
  ],
};

const mockVectorless = {
  generateKnowledge: vi.fn(),
  queryKnowledge: vi.fn(), 
  searchEntities: vi.fn(),
};

describe("VectorlessPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tools", () => {
    it("should have generate, query, search-entities, and list tools", () => {
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      const tools = plugin.tools;
      
      expect(tools).toHaveProperty("generate");
      expect(tools).toHaveProperty("query");
      expect(tools).toHaveProperty("search-entities");
      expect(tools).toHaveProperty("list");
    });
  });

  describe("generate tool", () => {
    it("should call generateKnowledge and return summary with counts", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue(mockKnowledge);
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      const result = await (plugin.tools.generate as any).execute({
        text: "TypeScript is great for React development",
        topic: "frontend"
      });
      
      expect(mockVectorless.generateKnowledge).toHaveBeenCalledWith(
        "TypeScript is great for React development",
        { topic: "frontend" }
      );
      expect(result).toBe("Knowledge extracted: 2 entities, 1 relations, 1 quotes");
    });

    it("should handle missing arrays in knowledge", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue({ entities: null, relations: [], quotes: undefined });
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      const result = await (plugin.tools.generate as any).execute({
        text: "Some text"
      });
      
      expect(result).toBe("Knowledge extracted: 0 entities, 0 relations, 0 quotes");
    });

    it("should try alternative method names", async () => {
      const altVectorless = { 
        generate: vi.fn().mockResolvedValue(mockKnowledge) 
      };
      const plugin = new VectorlessPlugin({ vectorless: altVectorless });
      
      const result = await (plugin.tools.generate as any).execute({
        text: "Some text"
      });
      
      expect(altVectorless.generate).toHaveBeenCalledWith("Some text", {});
      expect(result).toBe("Knowledge extracted: 2 entities, 1 relations, 1 quotes");
    });
  });

  describe("query tool", () => {
    it("should return answer from queryKnowledge", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue(mockKnowledge);
      mockVectorless.queryKnowledge.mockResolvedValue("TypeScript is a statically typed language");
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      // First generate knowledge
      await (plugin.tools.generate as any).execute({ text: "TypeScript info" });
      
      const result = await (plugin.tools.query as any).execute({
        question: "What is TypeScript?"
      });
      
      expect(mockVectorless.queryKnowledge).toHaveBeenCalledWith(
        "What is TypeScript?",
        mockKnowledge
      );
      expect(result).toBe("TypeScript is a statically typed language");
    });

    it("should return 'no knowledge' message when no KB loaded", async () => {
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      const result = await (plugin.tools.query as any).execute({
        question: "What is TypeScript?"
      });
      
      expect(result).toBe("No knowledge base loaded. Use knowledge:generate first.");
    });

    it("should stringify non-string results", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue(mockKnowledge);
      mockVectorless.queryKnowledge.mockResolvedValue({ answer: "Complex object answer" });
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools.query as any).execute({
        question: "Test question"
      });
      
      expect(result).toBe('{"answer":"Complex object answer"}');
    });

    it("should try alternative method names", async () => {
      const altVectorless = { 
        generateKnowledge: vi.fn().mockResolvedValue(mockKnowledge),
        ask: vi.fn().mockResolvedValue("Answer via ask method") 
      };
      const plugin = new VectorlessPlugin({ vectorless: altVectorless });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools.query as any).execute({
        question: "Test?"
      });
      
      expect(altVectorless.ask).toHaveBeenCalled();
      expect(result).toBe("Answer via ask method");
    });
  });

  describe("search-entities tool", () => {
    it("should return entities using searchEntities method", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue(mockKnowledge);
      mockVectorless.searchEntities.mockResolvedValue([
        { name: "TypeScript", type: "Language" }
      ]);
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools["search-entities"] as any).execute({
        query: "Type",
        limit: 10
      });
      
      expect(mockVectorless.searchEntities).toHaveBeenCalledWith(
        "Type",
        mockKnowledge,
        { limit: 10 }
      );
      expect(result).toEqual([{ name: "TypeScript", type: "Language" }]);
    });

    it("should fallback to filtering entities by name", async () => {
      const vectorlessWithoutSearch = {
        generateKnowledge: vi.fn().mockResolvedValue(mockKnowledge),
      };
      const plugin = new VectorlessPlugin({ vectorless: vectorlessWithoutSearch });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools["search-entities"] as any).execute({
        query: "type",
        limit: 5
      });
      
      expect(result).toEqual([{ name: "TypeScript", type: "Language" }]);
    });

    it("should handle entities with different field names", async () => {
      const knowledgeWithLabels = {
        entities: [
          { label: "MyLabel", category: "Type" },
          { name: "React", type: "Framework" },
        ],
        relations: [],
        quotes: [],
      };
      
      const vectorlessWithoutSearch = {
        generateKnowledge: vi.fn().mockResolvedValue(knowledgeWithLabels),
      };
      const plugin = new VectorlessPlugin({ vectorless: vectorlessWithoutSearch });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools["search-entities"] as any).execute({
        query: "label",
        limit: 5
      });
      
      expect(result).toEqual([{ label: "MyLabel", category: "Type" }]);
    });

    it("should return 'no knowledge' message when no KB loaded", async () => {
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      const result = await (plugin.tools["search-entities"] as any).execute({
        query: "test"
      });
      
      expect(result).toBe("No knowledge base loaded. Use knowledge:generate first.");
    });
  });

  describe("list tool", () => {
    it("should return all entities with name and type", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue(mockKnowledge);
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools.list as any).execute({});
      
      expect(result).toEqual([
        { name: "TypeScript", type: "Language" },
        { name: "React", type: "Framework" },
      ]);
    });

    it("should handle entities with label/category fields", async () => {
      const knowledgeWithDifferentFields = {
        entities: [
          { label: "SomeLabel", category: "SomeCategory" },
        ],
        relations: [],
        quotes: [],
      };
      
      mockVectorless.generateKnowledge.mockResolvedValue(knowledgeWithDifferentFields);
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools.list as any).execute({});
      
      expect(result).toEqual([
        { name: "SomeLabel", type: "SomeCategory" },
      ]);
    });

    it("should handle missing entities array", async () => {
      mockVectorless.generateKnowledge.mockResolvedValue({ entities: null });
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      await (plugin.tools.generate as any).execute({ text: "test" });
      const result = await (plugin.tools.list as any).execute({});
      
      expect(result).toEqual([]);
    });

    it("should return 'no knowledge' message when no KB loaded", async () => {
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      const result = await (plugin.tools.list as any).execute({});
      
      expect(result).toBe("No knowledge base loaded. Use knowledge:generate first.");
    });
  });

  describe("dispose", () => {
    it("should clear current knowledge and vectorless promise", async () => {
      const plugin = new VectorlessPlugin({ vectorless: mockVectorless });
      
      // Set some knowledge first
      await (plugin.tools.generate as any).execute({ text: "test" });
      
      await plugin.dispose();
      
      // Should have no knowledge after dispose
      const result = await (plugin.tools.query as any).execute({
        question: "test"
      });
      expect(result).toBe("No knowledge base loaded. Use knowledge:generate first.");
    });
  });
});