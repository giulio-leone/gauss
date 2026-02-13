// =============================================================================
// IndexedDbMemoryAdapter — MemoryPort via IndexedDB
// =============================================================================

import type { MemoryPort } from "../ports/memory.port.js";
import type { Todo } from "../domain/todo.schema.js";
import type { Checkpoint } from "../domain/checkpoint.schema.js";
import type { Message } from "../types.js";

// Minimal IndexedDB type declarations for cross-compilation
interface IDB {
  open(name: string, version?: number): IDBOpenReq;
}
interface IDBOpenReq {
  result: IDBDb;
  error: Error | null;
  onupgradeneeded: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}
interface IDBDb {
  transaction(stores: string[], mode?: string): IDBTx;
  close(): void;
  createObjectStore(name: string): IDBStore;
  objectStoreNames: { contains(name: string): boolean };
}
interface IDBTx {
  objectStore(name: string): IDBStore;
  error: Error | null;
  onerror: (() => void) | null;
}
interface IDBStore {
  get(key: string): IDBReq<unknown>;
  put(value: unknown, key?: string): IDBReq<unknown>;
  delete(key: string): IDBReq<undefined>;
  getAllKeys(): IDBReq<string[]>;
}
interface IDBReq<T> {
  result: T;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

const DB_VERSION = 1;
const STORE_TODOS = "todos";
const STORE_CHECKPOINTS = "checkpoints";
const STORE_CONVERSATIONS = "conversations";
const STORE_METADATA = "metadata";

function getIDB(): IDB {
  const idb = (globalThis as Record<string, unknown>).indexedDB as
    | IDB
    | undefined;
  if (!idb) {
    throw new Error("IndexedDB is not available in this environment");
  }
  return idb;
}

function idbRequest<T>(request: IDBReq<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransaction(
  db: IDBDb,
  stores: string[],
  mode: string,
): IDBTx {
  return db.transaction(stores, mode);
}

interface IndexedDbMemoryOptions {
  dbName?: string;
}

export class IndexedDbMemoryAdapter implements MemoryPort {
  private readonly dbName: string;
  private db: IDBDb | null = null;
  private dbPromise: Promise<IDBDb> | null = null;

  constructor(options: IndexedDbMemoryOptions = {}) {
    this.dbName = options.dbName ?? "deep-agent-memory";
  }

  // ---------------------------------------------------------------------------
  // DB lifecycle
  // ---------------------------------------------------------------------------

  private async getDb(): Promise<IDBDb> {
    if (this.db) return this.db;
    if (!this.dbPromise) {
      this.dbPromise = this.openDb();
    }
    return this.dbPromise;
  }

  private openDb(): Promise<IDBDb> {
    const idb = getIDB();
    return new Promise((resolve, reject) => {
      const request = idb.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_TODOS)) {
          db.createObjectStore(STORE_TODOS);
        }
        if (!db.objectStoreNames.contains(STORE_CHECKPOINTS)) {
          db.createObjectStore(STORE_CHECKPOINTS);
        }
        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          db.createObjectStore(STORE_CONVERSATIONS);
        }
        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db!);
      };
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Todos
  // ---------------------------------------------------------------------------

  async saveTodos(sessionId: string, todos: Todo[]): Promise<void> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_TODOS], "readwrite");
    await idbRequest(tx.objectStore(STORE_TODOS).put(todos, sessionId));
  }

  async loadTodos(sessionId: string): Promise<Todo[]> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_TODOS], "readonly");
    const result = await idbRequest(tx.objectStore(STORE_TODOS).get(sessionId));
    return (result as Todo[] | undefined) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Checkpoints
  // ---------------------------------------------------------------------------

  async saveCheckpoint(
    sessionId: string,
    checkpoint: Checkpoint,
  ): Promise<void> {
    const db = await this.getDb();
    const key = `${sessionId}:${checkpoint.id}`;
    const tx = idbTransaction(db, [STORE_CHECKPOINTS], "readwrite");
    await idbRequest(tx.objectStore(STORE_CHECKPOINTS).put(checkpoint, key));
  }

  async loadLatestCheckpoint(sessionId: string): Promise<Checkpoint | null> {
    const checkpoints = await this.listCheckpoints(sessionId);
    if (checkpoints.length === 0) return null;
    return checkpoints[checkpoints.length - 1] ?? null;
  }

  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_CHECKPOINTS], "readonly");
    const store = tx.objectStore(STORE_CHECKPOINTS);
    const allKeys = await idbRequest(store.getAllKeys());
    const prefix = `${sessionId}:`;
    const matchingKeys = (allKeys as string[]).filter((k) =>
      k.startsWith(prefix),
    );
    const results: Checkpoint[] = [];
    for (const key of matchingKeys) {
      const cp = await idbRequest(store.get(key));
      if (cp) results.push(cp as Checkpoint);
    }
    results.sort((a, b) => a.createdAt - b.createdAt);
    return results;
  }

  async deleteOldCheckpoints(
    sessionId: string,
    keepCount: number,
  ): Promise<void> {
    const checkpoints = await this.listCheckpoints(sessionId);
    if (checkpoints.length <= keepCount) return;
    const toDelete = checkpoints.slice(0, checkpoints.length - keepCount);
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_CHECKPOINTS], "readwrite");
    const store = tx.objectStore(STORE_CHECKPOINTS);
    for (const cp of toDelete) {
      await idbRequest(store.delete(`${sessionId}:${cp.id}`));
    }
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  async saveConversation(
    sessionId: string,
    messages: Message[],
  ): Promise<void> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_CONVERSATIONS], "readwrite");
    await idbRequest(
      tx.objectStore(STORE_CONVERSATIONS).put(messages, sessionId),
    );
  }

  async loadConversation(sessionId: string): Promise<Message[]> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_CONVERSATIONS], "readonly");
    const result = await idbRequest(
      tx.objectStore(STORE_CONVERSATIONS).get(sessionId),
    );
    return (result as Message[] | undefined) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  async saveMetadata(
    sessionId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_METADATA], "readwrite");
    await idbRequest(
      tx.objectStore(STORE_METADATA).put(value, `${sessionId}:${key}`),
    );
  }

  async loadMetadata<T = unknown>(
    sessionId: string,
    key: string,
  ): Promise<T | null> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_METADATA], "readonly");
    const result = await idbRequest(
      tx.objectStore(STORE_METADATA).get(`${sessionId}:${key}`),
    );
    return (result as T | undefined) ?? null;
  }

  async deleteMetadata(sessionId: string, key: string): Promise<void> {
    const db = await this.getDb();
    const tx = idbTransaction(db, [STORE_METADATA], "readwrite");
    await idbRequest(
      tx.objectStore(STORE_METADATA).delete(`${sessionId}:${key}`),
    );
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  close(): void {
    this.db?.close();
    this.db = null;
    this.dbPromise = null;
  }
}
