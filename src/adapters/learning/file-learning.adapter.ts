// =============================================================================
// FileLearningAdapter — File-backed persistent learning
// =============================================================================

import type { LearningPort } from "../../ports/learning.port.js";
import type { UserProfile, UserMemory, UserMemoryInput, SharedKnowledge, SharedKnowledgeInput } from "../../domain/learning.schema.js";

export interface FileLearningOptions {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  /** Base directory for learning data */
  baseDir: string;
  resolve: (...parts: string[]) => string;
}

interface LearningStore {
  profiles: Record<string, UserProfile>;
  memories: Record<string, UserMemory[]>;
  knowledge: SharedKnowledge[];
}

export class FileLearningAdapter implements LearningPort {
  private readonly opts: FileLearningOptions;
  private store: LearningStore = { profiles: {}, memories: {}, knowledge: [] };
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: FileLearningOptions) {
    this.opts = options;
  }

  private get filePath(): string {
    return this.opts.resolve(this.opts.baseDir, "learning-store.json");
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      if (await this.opts.exists(this.filePath)) {
        const raw = await this.opts.readFile(this.filePath);
        this.store = JSON.parse(raw);
      }
    } catch {
      // Start fresh on corrupted file
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    // Serialize writes to prevent race conditions
    const prev = this.writeQueue;
    this.writeQueue = prev.then(() =>
      this.opts.writeFile(this.filePath, JSON.stringify(this.store, null, 2)),
    );
    await this.writeQueue;
  }

  // -- Profile --
  async getProfile(userId: string): Promise<UserProfile | null> {
    await this.load();
    return this.store.profiles[userId] ?? null;
  }

  async updateProfile(
    userId: string,
    updates: Partial<Omit<UserProfile, "userId" | "createdAt">>,
  ): Promise<UserProfile> {
    await this.load();
    const existing = this.store.profiles[userId];
    const profile: UserProfile = {
      ...(existing ?? { userId, createdAt: Date.now() }),
      ...updates,
      userId,
    } as UserProfile;
    this.store.profiles[userId] = profile;
    await this.save();
    return profile;
  }

  async deleteProfile(userId: string): Promise<void> {
    await this.load();
    delete this.store.profiles[userId];
    await this.save();
  }

  // -- Memories --
  async addMemory(
    userId: string,
    memory: Omit<UserMemoryInput, "id" | "createdAt">,
  ): Promise<UserMemory> {
    await this.load();
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: UserMemory = {
      ...memory,
      id,
      createdAt: Date.now(),
    } as UserMemory;

    if (!this.store.memories[userId]) {
      this.store.memories[userId] = [];
    }
    this.store.memories[userId].push(entry);
    await this.save();
    return entry;
  }

  async getMemories(
    userId: string,
    options?: { tags?: string[]; limit?: number; since?: number },
  ): Promise<UserMemory[]> {
    await this.load();
    let memories = this.store.memories[userId] ?? [];

    if (options?.since) {
      memories = memories.filter((m) => m.createdAt >= options.since!);
    }
    if (options?.tags && options.tags.length > 0) {
      memories = memories.filter((m) =>
        options.tags!.some((t) => m.tags?.includes(t)),
      );
    }
    if (options?.limit) {
      memories = memories.slice(-options.limit);
    }

    return memories;
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    await this.load();
    const mems = this.store.memories[userId];
    if (mems) {
      this.store.memories[userId] = mems.filter((m) => m.id !== memoryId);
      await this.save();
    }
  }

  async clearMemories(userId: string): Promise<void> {
    await this.load();
    delete this.store.memories[userId];
    await this.save();
  }

  // -- Knowledge --
  async addKnowledge(
    knowledge: Omit<SharedKnowledgeInput, "id" | "createdAt" | "usageCount">,
  ): Promise<SharedKnowledge> {
    await this.load();
    const id = `know-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: SharedKnowledge = {
      ...knowledge,
      id,
      createdAt: Date.now(),
      usageCount: 0,
    } as SharedKnowledge;
    this.store.knowledge.push(entry);
    await this.save();
    return entry;
  }

  async queryKnowledge(
    query: string,
    options?: { category?: string; limit?: number },
  ): Promise<SharedKnowledge[]> {
    await this.load();
    let results = this.store.knowledge;
    const q = query.toLowerCase();

    results = results.filter((k) => {
      const text = JSON.stringify(k).toLowerCase();
      return text.includes(q);
    });

    if (options?.category) {
      results = results.filter((k) => k.category === options.category);
    }

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async incrementKnowledgeUsage(knowledgeId: string): Promise<void> {
    await this.load();
    const entry = this.store.knowledge.find((k) => k.id === knowledgeId);
    if (entry) {
      entry.usageCount++;
      await this.save();
    }
  }

  async deleteKnowledge(knowledgeId: string): Promise<void> {
    await this.load();
    this.store.knowledge = this.store.knowledge.filter((k) => k.id !== knowledgeId);
    await this.save();
  }
}
