import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryLearningAdapter } from "../in-memory-learning.adapter.js";
import type { UserProfile, UserMemory, SharedKnowledge } from "../../../domain/learning.schema.js";

describe("InMemoryLearningAdapter", () => {
  let adapter: InMemoryLearningAdapter;

  beforeEach(() => {
    adapter = new InMemoryLearningAdapter();
  });

  describe("Profile", () => {
    it("should return null for unknown user", async () => {
      const profile = await adapter.getProfile("unknown-user");
      expect(profile).toBeNull();
    });

    it("should create profile with updateProfile", async () => {
      const profile = await adapter.updateProfile("user1", {
        preferences: { theme: "dark" },
        language: "en",
      });

      expect(profile).toMatchObject({
        userId: "user1",
        preferences: { theme: "dark" },
        language: "en",
      });
      expect(profile.createdAt).toBeGreaterThan(0);
      expect(profile.updatedAt).toBeGreaterThan(0);
    });

    it("should merge updates with existing profile", async () => {
      const now = Date.now();
      await adapter.updateProfile("user1", {
        preferences: { theme: "dark" },
        language: "en",
      });

      const updated = await adapter.updateProfile("user1", {
        preferences: { fontSize: "14px" },
        style: "technical",
      });

      expect(updated).toMatchObject({
        userId: "user1",
        preferences: { fontSize: "14px" },
        language: "en",
        style: "technical",
      });
      expect(updated.updatedAt).toBeGreaterThanOrEqual(now);
    });

    it("should delete profile", async () => {
      await adapter.updateProfile("user1", { language: "en" });
      await adapter.deleteProfile("user1");
      
      const profile = await adapter.getProfile("user1");
      expect(profile).toBeNull();
    });
  });

  describe("Memory", () => {
    it("should add memory with UUID", async () => {
      const memory = await adapter.addMemory("user1", {
        content: "User likes TypeScript",
        tags: ["language"],
        confidence: 0.9,
        source: "explicit",
      });

      expect(memory).toMatchObject({
        content: "User likes TypeScript",
        tags: ["language"],
        confidence: 0.9,
        source: "explicit",
      });
      expect(memory.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(memory.createdAt).toBeGreaterThan(0);
    });

    it("should get all memories", async () => {
      await adapter.addMemory("user1", { content: "Memory 1" });
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await adapter.addMemory("user1", { content: "Memory 2" });

      const memories = await adapter.getMemories("user1");
      expect(memories).toHaveLength(2);
      expect(memories[0].content).toBe("Memory 2"); // Most recent first
      expect(memories[1].content).toBe("Memory 1");
    });

    it("should filter memories by tags", async () => {
      await adapter.addMemory("user1", { content: "JS memory", tags: ["javascript"] });
      await adapter.addMemory("user1", { content: "TS memory", tags: ["typescript"] });
      await adapter.addMemory("user1", { content: "Both", tags: ["javascript", "typescript"] });

      const jsMemories = await adapter.getMemories("user1", { tags: ["javascript"] });
      expect(jsMemories).toHaveLength(2);
      expect(jsMemories.map(m => m.content)).toContain("JS memory");
      expect(jsMemories.map(m => m.content)).toContain("Both");
    });

    it("should limit memories", async () => {
      await adapter.addMemory("user1", { content: "Memory 1" });
      await adapter.addMemory("user1", { content: "Memory 2" });
      await adapter.addMemory("user1", { content: "Memory 3" });

      const memories = await adapter.getMemories("user1", { limit: 2 });
      expect(memories).toHaveLength(2);
    });

    it("should filter memories by since timestamp", async () => {
      const now = Date.now();
      await adapter.addMemory("user1", { content: "Old memory" });
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const cutoff = Date.now();
      
      await adapter.addMemory("user1", { content: "New memory" });

      const recentMemories = await adapter.getMemories("user1", { since: cutoff });
      expect(recentMemories).toHaveLength(1);
      expect(recentMemories[0].content).toBe("New memory");
    });

    it("should delete specific memory", async () => {
      const memory1 = await adapter.addMemory("user1", { content: "Memory 1" });
      await adapter.addMemory("user1", { content: "Memory 2" });

      await adapter.deleteMemory("user1", memory1.id);
      const memories = await adapter.getMemories("user1");
      expect(memories).toHaveLength(1);
      expect(memories[0].content).toBe("Memory 2");
    });

    it("should clear all memories for user", async () => {
      await adapter.addMemory("user1", { content: "Memory 1" });
      await adapter.addMemory("user1", { content: "Memory 2" });

      await adapter.clearMemories("user1");
      const memories = await adapter.getMemories("user1");
      expect(memories).toHaveLength(0);
    });
  });

  describe("Knowledge", () => {
    it("should add knowledge with UUID and defaults", async () => {
      const knowledge = await adapter.addKnowledge({
        content: "React is a JavaScript library",
        category: "frontend",
        tags: ["react", "javascript"],
      });

      expect(knowledge).toMatchObject({
        content: "React is a JavaScript library",
        category: "frontend",
        tags: ["react", "javascript"],
        usageCount: 0,
      });
      expect(knowledge.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(knowledge.createdAt).toBeGreaterThan(0);
    });

    it("should query knowledge with substring match", async () => {
      await adapter.addKnowledge({
        content: "React is a JavaScript library for building UIs",
        category: "frontend",
      });
      await adapter.addKnowledge({
        content: "Vue.js is also a JavaScript framework",
        category: "frontend",
      });

      const results = await adapter.queryKnowledge("react");
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("React");

      const jsResults = await adapter.queryKnowledge("javascript");
      expect(jsResults).toHaveLength(2);
    });

    it("should query knowledge with category filter", async () => {
      await adapter.addKnowledge({
        content: "Frontend knowledge",
        category: "frontend",
      });
      await adapter.addKnowledge({
        content: "Backend knowledge",
        category: "backend",
      });

      const results = await adapter.queryKnowledge("knowledge", { category: "frontend" });
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe("frontend");
    });

    it("should query knowledge with limit", async () => {
      await adapter.addKnowledge({ content: "Knowledge 1" });
      await adapter.addKnowledge({ content: "Knowledge 2" });
      await adapter.addKnowledge({ content: "Knowledge 3" });

      const results = await adapter.queryKnowledge("knowledge", { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it("should increment knowledge usage count", async () => {
      const knowledge = await adapter.addKnowledge({
        content: "Useful knowledge",
      });

      await adapter.incrementKnowledgeUsage(knowledge.id);
      
      const results = await adapter.queryKnowledge("useful");
      expect(results[0].usageCount).toBe(1);
    });

    it("should delete knowledge", async () => {
      const knowledge = await adapter.addKnowledge({
        content: "Knowledge to delete",
      });

      await adapter.deleteKnowledge(knowledge.id);
      const results = await adapter.queryKnowledge("delete");
      expect(results).toHaveLength(0);
    });
  });

  describe("Utility", () => {
    it("should clear all data for a specific user", async () => {
      await adapter.updateProfile("user1", { language: "en" });
      await adapter.addMemory("user1", { content: "User1 memory" });
      await adapter.updateProfile("user2", { language: "es" });

      adapter.clear("user1");

      expect(await adapter.getProfile("user1")).toBeNull();
      expect(await adapter.getMemories("user1")).toHaveLength(0);
      expect(await adapter.getProfile("user2")).not.toBeNull();
    });

    it("should clear all users and shared knowledge", async () => {
      await adapter.updateProfile("user1", { language: "en" });
      await adapter.addMemory("user1", { content: "Memory" });
      await adapter.addKnowledge({ content: "Shared knowledge" });

      adapter.clearAll();

      expect(await adapter.getProfile("user1")).toBeNull();
      expect(await adapter.getMemories("user1")).toHaveLength(0);
      expect(await adapter.queryKnowledge("shared")).toHaveLength(0);
    });
  });
});