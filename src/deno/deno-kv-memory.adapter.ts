// =============================================================================
// DenoKvMemoryAdapter — MemoryPort backed by Deno KV
// =============================================================================

import type { MemoryPort } from "../ports/memory.port.js";
import type { Todo } from "../domain/todo.schema.js";
import type { Checkpoint } from "../domain/checkpoint.schema.js";
import type { Message } from "../types.js";

// -----------------------------------------------------------------------------
// Minimal Deno KV type declarations for cross-compilation
// -----------------------------------------------------------------------------

interface DenoKvEntry<T> {
  key: string[];
  value: T;
}

interface DenoKv {
  get<T>(key: string[]): Promise<{ value: T | null }>;
  set(key: string[], value: unknown): Promise<void>;
  delete(key: string[]): Promise<void>;
  list<T>(options: { prefix: string[] }): AsyncIterable<DenoKvEntry<T>>;
  close(): void;
}

interface DenoKvApi {
  openKv(path?: string): Promise<DenoKv>;
}

function getDenoKv(): DenoKvApi {
  const d = (globalThis as Record<string, unknown>).Deno as
    | DenoKvApi
    | undefined;
  if (!d || typeof d.openKv !== "function") {
    throw new Error("DenoKvMemoryAdapter requires the Deno runtime with KV support");
  }
  return d;
}

// -----------------------------------------------------------------------------
// Key builders
// -----------------------------------------------------------------------------

const PREFIX = "deep-agent";

function todosKey(sessionId: string): string[] {
  return [PREFIX, sessionId, "todos"];
}

function checkpointKey(sessionId: string, checkpointId: string): string[] {
  return [PREFIX, sessionId, "checkpoints", checkpointId];
}

function checkpointsPrefix(sessionId: string): string[] {
  return [PREFIX, sessionId, "checkpoints"];
}

function conversationKey(sessionId: string): string[] {
  return [PREFIX, sessionId, "conversation"];
}

function metadataKey(sessionId: string, key: string): string[] {
  return [PREFIX, sessionId, "metadata", key];
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Persistent state adapter backed by Deno KV.
 * Optionally accepts a file path for the KV store; omit for the default store.
 */
export class DenoKvMemoryAdapter implements MemoryPort {
  private kvPromise: Promise<DenoKv> | null = null;
  private readonly kvPath: string | undefined;

  constructor(kvPath?: string) {
    this.kvPath = kvPath;
  }

  private async kv(): Promise<DenoKv> {
    if (!this.kvPromise) {
      this.kvPromise = getDenoKv().openKv(this.kvPath).catch((err: unknown) => {
        this.kvPromise = null;
        throw err;
      });
    }
    return this.kvPromise;
  }

  // -- Todos ------------------------------------------------------------------

  async saveTodos(sessionId: string, todos: Todo[]): Promise<void> {
    const db = await this.kv();
    await db.set(todosKey(sessionId), todos);
  }

  async loadTodos(sessionId: string): Promise<Todo[]> {
    const db = await this.kv();
    const result = await db.get<Todo[]>(todosKey(sessionId));
    return result.value ?? [];
  }

  // -- Checkpoints ------------------------------------------------------------

  async saveCheckpoint(
    sessionId: string,
    checkpoint: Checkpoint,
  ): Promise<void> {
    const db = await this.kv();
    await db.set(checkpointKey(sessionId, checkpoint.id), checkpoint);
  }

  async loadLatestCheckpoint(
    sessionId: string,
  ): Promise<Checkpoint | null> {
    const all = await this.listCheckpoints(sessionId);
    if (all.length === 0) return null;
    all.sort((a, b) => a.createdAt - b.createdAt);
    return all[all.length - 1] ?? null;
  }

  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const db = await this.kv();
    const results: Checkpoint[] = [];
    for await (const entry of db.list<Checkpoint>({
      prefix: checkpointsPrefix(sessionId),
    })) {
      results.push(entry.value);
    }
    return results;
  }

  async deleteOldCheckpoints(
    sessionId: string,
    keepCount: number,
  ): Promise<void> {
    const all = await this.listCheckpoints(sessionId);
    if (all.length <= keepCount) return;
    all.sort((a, b) => a.createdAt - b.createdAt);
    const toDelete = all.slice(0, all.length - keepCount);
    const db = await this.kv();
    for (const cp of toDelete) {
      await db.delete(checkpointKey(sessionId, cp.id));
    }
  }

  // -- Conversation -----------------------------------------------------------

  async saveConversation(
    sessionId: string,
    messages: Message[],
  ): Promise<void> {
    const db = await this.kv();
    await db.set(conversationKey(sessionId), messages);
  }

  async loadConversation(sessionId: string): Promise<Message[]> {
    const db = await this.kv();
    const result = await db.get<Message[]>(conversationKey(sessionId));
    return result.value ?? [];
  }

  // -- Metadata ---------------------------------------------------------------

  async saveMetadata(
    sessionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const db = await this.kv();
    await db.set(metadataKey(sessionId, key), value);
  }

  async loadMetadata<T = unknown>(
    sessionId: string,
    key: string,
  ): Promise<T | null> {
    const db = await this.kv();
    const result = await db.get<T>(metadataKey(sessionId, key));
    return result.value ?? null;
  }

  async deleteMetadata(sessionId: string, key: string): Promise<void> {
    const db = await this.kv();
    await db.delete(metadataKey(sessionId, key));
  }

  // -- Lifecycle --------------------------------------------------------------

  /** Close the underlying KV connection */
  async close(): Promise<void> {
    if (this.kvPromise) {
      const db = await this.kvPromise;
      db.close();
      this.kvPromise = null;
    }
  }
}
