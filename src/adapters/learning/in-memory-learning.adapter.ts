// =============================================================================
// InMemoryLearningAdapter — In-memory implementation of LearningPort
// =============================================================================

import type { LearningPort } from "../../ports/learning.port.js";
import type { UserProfile, UserMemory, SharedKnowledge } from "../../domain/learning.schema.js";

/**
 * Stores all learning state in Maps keyed by userId.
 * Good for testing and standalone use.
 */
export class InMemoryLearningAdapter implements LearningPort {
  private readonly profilesMap = new Map<string, UserProfile>();
  private readonly memoriesMap = new Map<string, UserMemory[]>();
  private readonly knowledgeMap = new Map<string, SharedKnowledge>();

  // -- User Profile -----------------------------------------------------------

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.profilesMap.get(userId) ?? null;
  }

  async updateProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, "userId" | "createdAt">>,
  ): Promise<UserProfile> {
    const existing = this.profilesMap.get(userId);
    const now = Date.now();

    const profile: UserProfile = existing
      ? { ...existing, ...updates, updatedAt: now }
      : {
          userId,
          preferences: {},
          ...updates,
          updatedAt: now,
          createdAt: now,
        };

    this.profilesMap.set(userId, profile);
    return profile;
  }

  async deleteProfile(userId: string): Promise<void> {
    this.profilesMap.delete(userId);
  }

  // -- User Memories ----------------------------------------------------------

  async addMemory(
    userId: string,
    memory: Omit<UserMemory, "id" | "createdAt">,
  ): Promise<UserMemory> {
    const entry: UserMemory = {
      ...memory,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };

    const list = this.memoriesMap.get(userId) ?? [];
    list.push(entry);
    this.memoriesMap.set(userId, list);
    return entry;
  }

  async getMemories(
    userId: string,
    options?: { tags?: string[]; limit?: number; since?: number },
  ): Promise<UserMemory[]> {
    let memories = this.memoriesMap.get(userId) ?? [];

    if (options?.tags && options.tags.length > 0) {
      memories = memories.filter((m) =>
        options.tags!.some((tag) => m.tags.includes(tag)),
      );
    }

    if (options?.since) {
      memories = memories.filter((m) => m.createdAt >= options.since!);
    }

    // Most recent first
    memories = [...memories].sort((a, b) => b.createdAt - a.createdAt);

    if (options?.limit) {
      memories = memories.slice(0, options.limit);
    }

    return memories;
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    const list = this.memoriesMap.get(userId);
    if (!list) return;
    this.memoriesMap.set(
      userId,
      list.filter((m) => m.id !== memoryId),
    );
  }

  async clearMemories(userId: string): Promise<void> {
    this.memoriesMap.delete(userId);
  }

  // -- Shared Knowledge -------------------------------------------------------

  async addKnowledge(
    knowledge: Omit<SharedKnowledge, "id" | "createdAt" | "usageCount">,
  ): Promise<SharedKnowledge> {
    const entry: SharedKnowledge = {
      ...knowledge,
      id: crypto.randomUUID(),
      usageCount: 0,
      createdAt: Date.now(),
    };

    this.knowledgeMap.set(entry.id, entry);
    return entry;
  }

  async queryKnowledge(
    query: string,
    options?: { category?: string; limit?: number },
  ): Promise<SharedKnowledge[]> {
    const lowerQuery = query.toLowerCase();
    let results = Array.from(this.knowledgeMap.values()).filter((k) =>
      k.content.toLowerCase().includes(lowerQuery),
    );

    if (options?.category) {
      results = results.filter((k) => k.category === options.category);
    }

    // Most used first
    results.sort((a, b) => b.usageCount - a.usageCount);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async incrementKnowledgeUsage(knowledgeId: string): Promise<void> {
    const entry = this.knowledgeMap.get(knowledgeId);
    if (entry) {
      entry.usageCount++;
    }
  }

  async deleteKnowledge(knowledgeId: string): Promise<void> {
    this.knowledgeMap.delete(knowledgeId);
  }

  // -- Utility ----------------------------------------------------------------

  /** Clear all data for a user */
  clear(userId: string): void {
    this.profilesMap.delete(userId);
    this.memoriesMap.delete(userId);
  }

  /** Clear all users and shared knowledge */
  clearAll(): void {
    this.profilesMap.clear();
    this.memoriesMap.clear();
    this.knowledgeMap.clear();
  }
}
