// =============================================================================
// InMemoryAdapter — In-memory implementation of MemoryPort
// =============================================================================

import type { MemoryPort } from "../../ports/memory.port.js";
import type { Todo } from "../../domain/todo.schema.js";
import type { Checkpoint } from "../../domain/checkpoint.schema.js";
import type { Message } from "../../types.js";

/**
 * Stores all state in Maps keyed by sessionId.
 * Good for testing and standalone use.
 */
export class InMemoryAdapter implements MemoryPort {
  private static readonly MAX_SESSIONS = 1000;

  private readonly sessionOrder: string[] = [];
  private readonly todosMap = new Map<string, Todo[]>();
  private readonly checkpointsMap = new Map<string, Checkpoint[]>();
  private readonly conversationMap = new Map<string, Message[]>();
  private readonly metadataMap = new Map<string, Map<string, unknown>>();

  private trackSession(sessionId: string): void {
    const idx = this.sessionOrder.indexOf(sessionId);
    if (idx === -1) {
      this.sessionOrder.push(sessionId);
    }
    while (this.sessionOrder.length > InMemoryAdapter.MAX_SESSIONS) {
      const oldest = this.sessionOrder.shift();
      if (oldest !== undefined) {
        this.todosMap.delete(oldest);
        this.checkpointsMap.delete(oldest);
        this.conversationMap.delete(oldest);
        this.metadataMap.delete(oldest);
      }
    }
  }

  // -- Todos ------------------------------------------------------------------

  async saveTodos(sessionId: string, todos: Todo[]): Promise<void> {
    this.todosMap.set(sessionId, [...todos]);
    this.trackSession(sessionId);
  }

  async loadTodos(sessionId: string): Promise<Todo[]> {
    return this.todosMap.get(sessionId) ?? [];
  }

  // -- Checkpoints ------------------------------------------------------------

  async saveCheckpoint(
    sessionId: string,
    checkpoint: Checkpoint,
  ): Promise<void> {
    const list = this.checkpointsMap.get(sessionId) ?? [];
    list.push(checkpoint);
    this.checkpointsMap.set(sessionId, list);
    this.trackSession(sessionId);
  }

  async loadLatestCheckpoint(
    sessionId: string,
  ): Promise<Checkpoint | null> {
    const list = this.checkpointsMap.get(sessionId);
    if (!list || list.length === 0) return null;
    return list[list.length - 1] ?? null;
  }

  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    return this.checkpointsMap.get(sessionId) ?? [];
  }

  async deleteOldCheckpoints(
    sessionId: string,
    keepCount: number,
  ): Promise<void> {
    const list = this.checkpointsMap.get(sessionId);
    if (!list || list.length <= keepCount) return;
    this.checkpointsMap.set(sessionId, list.slice(-keepCount));
  }

  // -- Conversation -----------------------------------------------------------

  async saveConversation(
    sessionId: string,
    messages: Message[],
  ): Promise<void> {
    this.conversationMap.set(sessionId, [...messages]);
    this.trackSession(sessionId);
  }

  async loadConversation(sessionId: string): Promise<Message[]> {
    return this.conversationMap.get(sessionId) ?? [];
  }

  // -- Metadata ---------------------------------------------------------------

  async saveMetadata(
    sessionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    let map = this.metadataMap.get(sessionId);
    if (!map) {
      map = new Map<string, unknown>();
      this.metadataMap.set(sessionId, map);
    }
    map.set(key, value);
    this.trackSession(sessionId);
  }

  async loadMetadata<T = unknown>(
    sessionId: string,
    key: string,
  ): Promise<T | null> {
    const map = this.metadataMap.get(sessionId);
    if (!map || !map.has(key)) return null;
    return map.get(key) as T;
  }

  async deleteMetadata(sessionId: string, key: string): Promise<void> {
    this.metadataMap.get(sessionId)?.delete(key);
  }

  // -- Utility ----------------------------------------------------------------

  /** Clear all data for a session */
  clear(sessionId: string): void {
    this.todosMap.delete(sessionId);
    this.checkpointsMap.delete(sessionId);
    this.conversationMap.delete(sessionId);
    this.metadataMap.delete(sessionId);
    const idx = this.sessionOrder.indexOf(sessionId);
    if (idx !== -1) this.sessionOrder.splice(idx, 1);
  }

  /** Clear all sessions */
  clearAll(): void {
    this.todosMap.clear();
    this.checkpointsMap.clear();
    this.conversationMap.clear();
    this.metadataMap.clear();
    this.sessionOrder.length = 0;
  }
}
