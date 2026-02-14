// =============================================================================
// LearningPort — Cross-session learning contract
// =============================================================================

import type { UserProfile, UserMemory, UserMemoryInput, SharedKnowledge, SharedKnowledgeInput } from "../domain/learning.schema.js";

export interface LearningPort {
  // User Profile
  getProfile(userId: string): Promise<UserProfile | null>;
  updateProfile(userId: string, updates: Partial<Omit<UserProfile, "userId" | "createdAt">>): Promise<UserProfile>;
  deleteProfile(userId: string): Promise<void>;

  // User Memories
  addMemory(userId: string, memory: Omit<UserMemoryInput, "id" | "createdAt">): Promise<UserMemory>;
  getMemories(userId: string, options?: { tags?: string[]; limit?: number; since?: number }): Promise<UserMemory[]>;
  deleteMemory(userId: string, memoryId: string): Promise<void>;
  clearMemories(userId: string): Promise<void>;

  // Shared Knowledge
  addKnowledge(knowledge: Omit<SharedKnowledgeInput, "id" | "createdAt" | "usageCount">): Promise<SharedKnowledge>;
  queryKnowledge(query: string, options?: { category?: string; limit?: number }): Promise<SharedKnowledge[]>;
  incrementKnowledgeUsage(knowledgeId: string): Promise<void>;
  deleteKnowledge(knowledgeId: string): Promise<void>;
}
