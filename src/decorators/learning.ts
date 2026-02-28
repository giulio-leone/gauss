// =============================================================================
// Learning Decorator — User profile and memory injection
// =============================================================================

import type { Decorator, RunContext } from "../core/agent/types.js";

export interface LearningPort {
  getProfile(userId: string): Promise<UserProfile | null>;
  getMemories(userId: string, options?: { limit?: number }): Promise<UserMemory[]>;
  addMemory(userId: string, memory: { content: string; category?: string }): Promise<void>;
}

export interface UserProfile {
  name?: string;
  preferences?: Record<string, unknown>;
  language?: string;
  style?: string;
}

export interface UserMemory {
  id: string;
  content: string;
  category?: string;
  confidence: number;
}

export interface LearningConfig {
  backend: LearningPort;
  userId: string;
  maxMemories?: number;
}

export function learning(config: LearningConfig): Decorator {
  const { backend, userId, maxMemories = 10 } = config;

  return {
    name: "learning",

    async beforeRun(ctx: RunContext) {
      const [profile, memories] = await Promise.all([
        backend.getProfile(userId),
        backend.getMemories(userId, { limit: maxMemories }),
      ]);

      const contextParts: string[] = [];

      if (profile) {
        const profileInfo = [
          profile.name ? `User: ${profile.name}` : null,
          profile.language ? `Language: ${profile.language}` : null,
          profile.style ? `Communication style: ${profile.style}` : null,
        ]
          .filter(Boolean)
          .join(". ");
        if (profileInfo) contextParts.push(`[User Profile] ${profileInfo}`);
      }

      if (memories.length > 0) {
        const memoryText = memories
          .sort((a, b) => b.confidence - a.confidence)
          .map((m) => `- ${m.content}`)
          .join("\n");
        contextParts.push(`[User Memories]\n${memoryText}`);
      }

      if (contextParts.length > 0) {
        ctx.messages.push({
          role: "system",
          content: contextParts.join("\n\n"),
        });
      }

      return ctx;
    },
  };
}
