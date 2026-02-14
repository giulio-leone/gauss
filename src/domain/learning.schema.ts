// =============================================================================
// Learning Schemas — Cross-session memory structures
// =============================================================================

import { z } from "zod";

export const UserProfileSchema = z.object({
  userId: z.string(),
  preferences: z.record(z.string(), z.unknown()).default({}),
  language: z.string().optional(),
  style: z.enum(["concise", "detailed", "technical", "casual"]).optional(),
  context: z.string().optional().describe("Persistent context about the user"),
  updatedAt: z.number().default(() => Date.now()),
  createdAt: z.number().default(() => Date.now()),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UserMemorySchema = z.object({
  id: z.string(),
  content: z.string().describe("The learned fact or observation"),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1),
  source: z.enum(["explicit", "inferred"]).default("inferred"),
  createdAt: z.number().default(() => Date.now()),
});
export type UserMemory = z.infer<typeof UserMemorySchema>;

export const SharedKnowledgeSchema = z.object({
  id: z.string(),
  content: z.string().describe("The knowledge insight"),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  usageCount: z.number().default(0),
  createdAt: z.number().default(() => Date.now()),
});
export type SharedKnowledge = z.infer<typeof SharedKnowledgeSchema>;
