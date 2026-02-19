# SubagentRegistry + Async Dispatch — Design Document Architetturale

> **Framework**: GaussFlow (`@giulio-leone/gaussflow-agent`)  
> **Stato**: RFC — Design per implementazione reale  
> **Versione**: 1.0.0

---

## Sommario Esecutivo

Il `TaskTool` corrente (in `src/tools/subagent/task.tool.ts`) è **sincrono e bloccante**: quando il parent agent spawna un subagent, l'intero tool loop si blocca fino al completamento del child. Questo impedisce:

1. **Parallelismo**: l'LLM non può dispatchare N task concorrenti in un singolo step
2. **Streaming progressivo**: nessuna visibilità sull'output parziale del child durante l'esecuzione
3. **Cancellazione**: nessun meccanismo per interrompere un child che non risponde
4. **Scaling**: nessun controllo su risorse, concorrenza, backpressure

Questo documento propone un'architettura completa basata su **SubagentRegistry** (lifecycle manager), **SubagentScheduler** (resource management) e un **3-Tool Pattern** (dispatch/poll/await) che sostituisce il TaskTool sincrono con un modello asincrono non-bloccante.

---

## Indice

1. [SubagentRegistry — Design Completo](#1-subagentregistry--design-completo)
2. [3-Tool Pattern (dispatch/poll/await)](#2-3-tool-pattern-dispatchpollawait)
3. [Scaling a Swarm (10-100+ agenti)](#3-scaling-a-swarm-10-100-agenti)
4. [Integrazione con l'Architettura Esistente](#4-integrazione-con-larchitettura-esistente)
5. [Edge Cases e Failure Modes](#5-edge-cases-e-failure-modes)
6. [API Surface — Code Sketches Completi](#6-api-surface--code-sketches-completi)

---

## 1. SubagentRegistry — Design Completo

### 1.1 Filosofia

Il SubagentRegistry è il **single source of truth** per ogni subagent attivo nel sistema. Non esegue nulla direttamente — delega al `SubagentScheduler` per l'esecuzione e si occupa esclusivamente di:

- **Registrazione e tracking** di ogni handle subagent
- **State machine** rigorosa per ogni task
- **Garbage collection** di task completati/terminati
- **Resource isolation** e bounds enforcement

### 1.2 Interfacce TypeScript

```typescript
// =============================================================================
// SubagentHandle — Rappresenta un'istanza di subagent in esecuzione
// =============================================================================

export type SubagentTaskStatus =
  | "queued"       // In attesa nella coda del scheduler
  | "running"      // In esecuzione attiva
  | "streaming"    // In esecuzione con output parziale disponibile
  | "completed"    // Terminato con successo
  | "failed"       // Terminato con errore
  | "timeout"      // Terminato per timeout
  | "cancelled";   // Cancellato dal parent o dal sistema

export interface SubagentHandle {
  /** ID univoco del task (UUID v4) */
  readonly taskId: string;
  /** ID del parent agent che ha spawnato questo subagent */
  readonly parentId: string;
  /** Profondità di nesting (0 = child diretto del root) */
  readonly depth: number;
  /** Timestamp di creazione (Date.now()) */
  readonly createdAt: number;
  /** Stato corrente nella state machine */
  status: SubagentTaskStatus;
  /** Timestamp dell'ultimo cambio di stato */
  statusChangedAt: number;
  /** Priorità corrente (1-10, 1 = massima) */
  priority: number;
  /** Output parziale accumulato (per streaming progressivo) */
  partialOutput: string;
  /** Output finale (disponibile solo se status = "completed") */
  finalOutput: string | null;
  /** Errore (disponibile solo se status = "failed" | "timeout") */
  error: string | null;
  /** AbortController per cancellazione cooperativa */
  readonly abortController: AbortController;
  /** Prompt originale del task */
  readonly prompt: string;
  /** Instructions opzionali */
  readonly instructions: string | null;
  /** Timeout in ms per questo specifico task */
  readonly timeoutMs: number;
  /** Timer handle per il timeout */
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /** Token usage accumulato */
  tokenUsage: { input: number; output: number };
  /** Metadata opzionale passata dal parent */
  readonly metadata: Record<string, unknown>;
}
```

### 1.3 State Machine

La state machine è **lineare con branch terminali**. Nessuna transizione all'indietro è permessa.

```
                         ┌─────────────┐
                         │   queued     │ ← entry point
                         └──────┬──────┘
                                │ scheduler picks up
                                ▼
                         ┌─────────────┐
                    ┌────│   running    │────┐
                    │    └──────┬──────┘    │
                    │           │            │
            cancel  │   output  │            │ error/timeout/cancel
                    │   chunk   │            │
                    │           ▼            │
                    │    ┌─────────────┐    │
                    │    │  streaming   │────┤
                    │    └──────┬──────┘    │
                    │           │            │
                    │     done  │            │
                    │           ▼            │
                    │    ┌─────────────┐    │
                    │    │  completed   │    │  ← terminal
                    │    └─────────────┘    │
                    │                       │
                    ▼                       ▼
             ┌─────────────┐        ┌─────────────┐
             │  cancelled   │        │   failed     │  ← terminal
             └─────────────┘        └─────────────┘
                                          │
                                    ┌─────────────┐
                                    │   timeout    │  ← terminal (subset di failed)
                                    └─────────────┘
```

**Transizioni valide:**

| Da | A | Trigger |
|---|---|---|
| `queued` | `running` | Scheduler dequeue |
| `queued` | `cancelled` | Parent cancel / shutdown |
| `running` | `streaming` | Primo chunk di output |
| `running` | `completed` | Completamento senza output parziale |
| `running` | `failed` | Errore durante esecuzione |
| `running` | `timeout` | Timer scaduto |
| `running` | `cancelled` | AbortSignal |
| `streaming` | `completed` | Completamento con output finale |
| `streaming` | `failed` | Errore durante streaming |
| `streaming` | `timeout` | Timer scaduto |
| `streaming` | `cancelled` | AbortSignal |

**Invariante**: Ogni transizione è atomica e emette un evento `subagent:status-change` sull'EventBus.

### 1.4 Lifecycle Management

```
  CREAZIONE                 ESECUZIONE                 CLEANUP
  ────────                  ──────────                 ───────
  registry.dispatch()       scheduler.run()            registry.gc()
       │                         │                         │
       ▼                         ▼                         ▼
  1. Validate input          1. Dequeue handle          1. Scan handles
  2. Create handle           2. Create VFS isolato      2. Find terminal
  3. Assign priority         3. Create ToolLoopAgent    3. age > gcTtlMs?
  4. Register in Map         4. Wire AbortSignal        4. Remove handle
  5. Enqueue in scheduler    5. Start timeout timer     5. Emit gc event
  6. Emit subagent:spawn     6. Run with streaming      6. Cleanup VFS
  7. Return taskId           7. Collect output chunks
                             8. Update handle status
                             9. Clear timeout timer
                             10. Emit subagent:complete
```

### 1.5 Memory Isolation

Ogni subagent opera in un **sandbox isolato**:

- **VirtualFilesystem separato**: il child riceve un `VirtualFilesystem` proprio (come il TaskTool attuale alla riga 60 di task.tool.ts), mai accesso diretto al VFS del parent
- **SharedContext read-only**: il child può leggere dal `SharedContext` del parent ma le scritture avvengono in un namespace dedicato (`/.shared/subagent/{taskId}/`)
- **Token budget indipendente**: ogni handle ha il proprio `TokenTracker` con budget configurabile
- **No reference sharing**: nessun oggetto mutabile è condiviso tra parent e child — solo stringhe serializzate passano attraverso il confine

### 1.6 Resource Bounds

```typescript
export interface SubagentResourceLimits {
  /** Massimo numero di subagent concorrenti per parent. Default: 5 */
  maxConcurrentPerParent: number;
  /** Massimo numero totale di subagent nel sistema. Default: 50 */
  maxConcurrentGlobal: number;
  /** Massima profondità di nesting. Default: 3 */
  maxDepth: number;
  /** Timeout di default per un singolo subagent in ms. Default: 300_000 (5 min) */
  defaultTimeoutMs: number;
  /** Massimo timeout permesso per un singolo subagent in ms. Default: 600_000 (10 min) */
  maxTimeoutMs: number;
  /** Massimo numero di task in coda. Default: 100 */
  maxQueueSize: number;
  /** TTL per handle completati prima del GC in ms. Default: 60_000 (1 min) */
  gcTtlMs: number;
  /** Intervallo di GC in ms. Default: 30_000 (30 sec) */
  gcIntervalMs: number;
  /** Massimo steps per subagent. Default: 20 */
  maxStepsPerSubagent: number;
}
```

### 1.7 Cancellation Support (AbortController)

Ogni `SubagentHandle` possiede un `AbortController`. La cancellazione è **cooperativa**:

1. `registry.cancel(taskId)` chiama `handle.abortController.abort()`
2. Il `ToolLoopAgent` (Vercel AI SDK v6) riceve l'`AbortSignal` e interrompe la generazione
3. Lo scheduler cattura l'`AbortError` e transiziona lo stato a `cancelled`
4. Il timeout timer viene cancellato
5. L'evento `subagent:cancelled` viene emesso

**Cancellazione a cascata**: quando un parent viene cancellato, il registry itera tutti i child handle con `parentId` matching e li cancella ricorsivamente.

### 1.8 Backpressure

Quando la coda del scheduler raggiunge `maxQueueSize`:

1. **Reject immediato**: `dispatch()` ritorna un errore specifico `SubagentQueueFullError` invece di accodare
2. **L'LLM riceve il messaggio di errore** come risultato del tool `dispatch_subagent`
3. **L'LLM decide**: può ritentare dopo un poll che mostra task completati, oppure rinunciare
4. **Metrica emessa**: `subagent:backpressure` con `{queueSize, maxQueueSize}`

Non usiamo backpressure basata su token bucket perché l'LLM non ha un concetto di "rallentare" — o dispatcha o riceve un errore.

---

## 2. 3-Tool Pattern (dispatch/poll/await)

### 2.1 Razionale

Il TaskTool corrente (`src/tools/subagent/task.tool.ts:55-98`) è un singolo tool sincrono:

```
LLM → tool_call(task, {prompt}) → [BLOCCO per 5 minuti] → result
```

Questo significa che durante l'esecuzione del subagent, il parent LLM è completamente bloccato. Non può:
- Lanciare altri subagent in parallelo
- Leggere file mentre aspetta
- Prendere decisioni basate su output parziali

Il 3-Tool Pattern rompe questa limitazione:

```
LLM → dispatch_subagent({prompt})     → taskId (ritorno immediato)
LLM → dispatch_subagent({prompt2})    → taskId2 (batch dispatch!)
LLM → poll_subagent({taskIds})        → {status, partialOutput} per ogni task
LLM → await_subagent({taskId})        → output finale (bloccante, ma su un singolo task)
```

### 2.2 Tool #1: `dispatch_subagent`

**Scopo**: Spawna un subagent e ritorna immediatamente con un `taskId`.

```typescript
import { z } from "zod";

// --- Input Schema ---
export const DispatchSubagentInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(10_000)
    .describe("Task description for the subagent"),
  instructions: z
    .string()
    .max(5_000)
    .optional()
    .describe("Optional system instructions for the subagent"),
  priority: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Priority (1=highest, 10=lowest). Default: 5"),
  timeoutMs: z
    .number()
    .int()
    .min(5_000)
    .max(600_000)
    .optional()
    .describe("Timeout in milliseconds. Default: 300000 (5 min)"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional metadata to pass to the subagent"),
});

export type DispatchSubagentInput = z.infer<typeof DispatchSubagentInputSchema>;

// --- Output Schema ---
export const DispatchSubagentOutputSchema = z.object({
  taskId: z.string().uuid(),
  status: z.literal("queued"),
  queuePosition: z.number().int().nonnegative(),
  estimatedStartMs: z.number().int().nonnegative().optional(),
});

export type DispatchSubagentOutput = z.infer<typeof DispatchSubagentOutputSchema>;
```

**Comportamento**:
1. Valida input, verifica limiti di nesting depth
2. Chiama `registry.dispatch()` → crea handle, accoda
3. Ritorna `{taskId, status: "queued", queuePosition}` **in < 1ms**
4. L'LLM può immediatamente dispatchare un altro task nello stesso step

**Batch dispatch**: l'LLM di Vercel AI SDK v6 supporta **multiple tool calls in un singolo step**. Il parent può emettere N `dispatch_subagent` calls in parallelo, e il framework le esegue tutte concorrentemente. Non serve un input `tasks[]` — il batch è nativo del protocollo.

### 2.3 Tool #2: `poll_subagent`

**Scopo**: Controlla lo stato di uno o più task senza bloccare.

```typescript
// --- Input Schema ---
export const PollSubagentInputSchema = z.object({
  taskIds: z
    .array(z.string().uuid())
    .min(1)
    .max(50)
    .describe("Task IDs to check status for"),
  includePartialOutput: z
    .boolean()
    .default(true)
    .describe("Whether to include partial output from streaming tasks"),
  maxPartialOutputLength: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(2_000)
    .describe("Maximum characters of partial output to return per task"),
});

export type PollSubagentInput = z.infer<typeof PollSubagentInputSchema>;

// --- Output per-task ---
export const TaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum([
    "queued", "running", "streaming",
    "completed", "failed", "timeout", "cancelled",
  ]),
  partialOutput: z.string().optional(),
  finalOutput: z.string().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  tokenUsage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }).optional(),
});

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// --- Output Schema ---
export const PollSubagentOutputSchema = z.object({
  tasks: z.array(TaskStatusSchema),
  summary: z.object({
    total: z.number().int(),
    queued: z.number().int(),
    running: z.number().int(),
    streaming: z.number().int(),
    completed: z.number().int(),
    failed: z.number().int(),
    timeout: z.number().int(),
    cancelled: z.number().int(),
  }),
});

export type PollSubagentOutput = z.infer<typeof PollSubagentOutputSchema>;
```

**Comportamento**:
1. Itera i `taskIds`, legge stato da registry
2. Per task in `streaming`: include `partialOutput` troncato a `maxPartialOutputLength`
3. Per task `completed`: include `finalOutput` (completo)
4. Per task `failed`/`timeout`: include `error`
5. Aggiunge `summary` con conteggi per stato
6. Ritorna immediatamente (non blocca mai)

**Streaming progressivo**: il `partialOutput` viene accumulato dallo scheduler man mano che il ToolLoopAgent del child produce output. L'LLM del parent può fare polling periodico per vedere il progresso, adattando la sua strategia in base a ciò che vede.

### 2.4 Tool #3: `await_subagent`

**Scopo**: Attende il completamento di un singolo task. Bloccante, ma solo per quel task.

```typescript
// --- Input Schema ---
export const AwaitSubagentInputSchema = z.object({
  taskId: z
    .string()
    .uuid()
    .describe("Task ID to wait for"),
  timeoutMs: z
    .number()
    .int()
    .min(1_000)
    .max(600_000)
    .default(300_000)
    .describe("Maximum time to wait in milliseconds. Default: 300000"),
});

export type AwaitSubagentInput = z.infer<typeof AwaitSubagentInputSchema>;

// --- Output Schema ---
export const AwaitSubagentOutputSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["completed", "failed", "timeout", "cancelled"]),
  output: z.string().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
  tokenUsage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
});

export type AwaitSubagentOutput = z.infer<typeof AwaitSubagentOutputSchema>;
```

**Comportamento**:
1. Se il task è già in stato terminale → ritorna immediatamente
2. Altrimenti, crea una `Promise` che si risolve quando il handle transiziona a uno stato terminale
3. Race contro `timeoutMs` — se scade, ritorna `{status: "timeout"}`
4. Race contro `AbortSignal` del parent — se il parent viene cancellato, il wait si risolve con `cancelled`

**Pattern d'uso tipico dell'LLM**:

```
Step 1: dispatch_subagent("Analizza file A") → taskId1
Step 1: dispatch_subagent("Analizza file B") → taskId2
Step 2: poll_subagent([taskId1, taskId2])     → {1: streaming, 2: running}
Step 3: poll_subagent([taskId1, taskId2])     → {1: completed, 2: streaming}
Step 3: await_subagent(taskId2)               → output finale
Step 4: (usa entrambi i risultati per generare la risposta)
```

### 2.5 Error Propagation

Gli errori dei child **non crashano il parent**. Vengono incapsulati nel risultato del tool:

```typescript
// Se un child fallisce, poll/await ritornano:
{
  taskId: "abc-123",
  status: "failed",
  error: "RangeError: Maximum call stack size exceeded",
  durationMs: 15234,
  tokenUsage: { input: 1200, output: 340 }
}
```

L'LLM del parent vede l'errore come testo nel tool result e decide come gestirlo:
- Ritentare con prompt diverso
- Ignorare e procedere senza quel risultato
- Riportare l'errore all'utente

**Non c'è propagazione automatica di eccezioni**. Questo è intenzionale: un child che fallisce non deve mai far fallire il parent.

### 2.6 Timeout Cascading

I timeout sono **gerarchici**:

```
Parent timeout (T_parent = 600s)
├── Child A timeout (T_a = 120s) ← min(T_a, T_parent - elapsed)
├── Child B timeout (T_b = 300s) ← min(T_b, T_parent - elapsed)
└── Child C timeout (T_c = 180s) ← min(T_c, T_parent - elapsed)
    └── Grandchild C1 timeout (T_c1 = 60s) ← min(T_c1, T_c - elapsed_c)
```

**Formula**: `effectiveTimeout = min(requestedTimeout, parentRemainingTime)`

Se il parent ha 100s rimanenti e il child richiede 300s, il child riceve `effectiveTimeout = 100s`. Quando il parent scade, tutti i child vengono cancellati tramite cascading abort.

---

## 3. Scaling a Swarm (10-100+ agenti)

### 3.1 Pool Sizing Dinamico

Il `SubagentScheduler` gestisce un pool di worker slot:

```typescript
export interface PoolConfig {
  /** Slot minimi sempre disponibili. Default: 2 */
  minWorkers: number;
  /** Slot massimi allocabili. Default: 20 */
  maxWorkers: number;
  /** Soglia di utilizzo (%) per scale-up. Default: 80 */
  scaleUpThreshold: number;
  /** Soglia di utilizzo (%) per scale-down. Default: 30 */
  scaleDownThreshold: number;
  /** Cooldown tra resize in ms. Default: 10_000 */
  resizeCooldownMs: number;
}
```

**Algoritmo di scaling**:
1. Ogni `resizeCooldownMs`, il scheduler calcola `utilization = activeWorkers / currentPoolSize`
2. Se `utilization > scaleUpThreshold`: `newSize = min(currentSize * 1.5, maxWorkers)`
3. Se `utilization < scaleDownThreshold`: `newSize = max(currentSize * 0.75, minWorkers)`
4. Il resize è graduale (non istantaneo) per evitare oscillazioni

### 3.2 Priority Queue con Starvation Prevention

La coda usa un **heap binario** con aging:

```typescript
export interface QueueEntry {
  handle: SubagentHandle;
  /** Priorità effettiva = basePriority - agingBonus */
  effectivePriority: number;
  /** Timestamp di enqueue */
  enqueuedAt: number;
}
```

**Aging**: ogni `agingIntervalMs` (default: 5000ms), tutti i task in coda vedono la loro `effectivePriority` decrementata di 1 (= diventano più prioritari). Questo garantisce che anche un task a priorità 10 venga eventualmente eseguito.

**Formula di aging**:
```
effectivePriority = basePriority - floor((now - enqueuedAt) / agingIntervalMs)
effectivePriority = max(1, effectivePriority)  // mai sotto 1
```

Un task a priorità 10 in coda da 45 secondi con `agingIntervalMs=5000`:
- `effectivePriority = 10 - floor(45000/5000) = 10 - 9 = 1` → priorità massima!

### 3.3 Resource Quotas per Tenant

Ogni parent agent è un "tenant" con quote dedicate:

```typescript
export interface TenantQuota {
  /** Massimo subagent concorrenti per questo parent. Default: 5 */
  maxConcurrent: number;
  /** Massimo subagent in coda per questo parent. Default: 20 */
  maxQueued: number;
  /** Budget token massimo per tutti i child di questo parent. Default: 500_000 */
  maxTotalTokens: number;
  /** Consumo corrente */
  currentConcurrent: number;
  currentQueued: number;
  currentTotalTokens: number;
}
```

Quando un parent tenta di dispatchare un subagent che supererebbe la quota:
1. Se `currentConcurrent >= maxConcurrent` → il task va in coda (non rifiutato)
2. Se `currentQueued >= maxQueued` → il dispatch viene rifiutato con errore
3. Se `currentTotalTokens >= maxTotalTokens` → il dispatch viene rifiutato con errore

### 3.4 Circuit Breaker per-Subagent

Riutilizziamo il pattern del `CircuitBreaker` esistente (`src/adapters/resilience/circuit-breaker.ts`) ma con granularità per **tipo di task**:

```typescript
export interface SubagentCircuitBreakerConfig {
  /** Soglia di fallimenti per tipo di task in una finestra. Default: 3 */
  failureThreshold: number;
  /** Finestra di monitoraggio in ms. Default: 60_000 */
  monitorWindowMs: number;
  /** Tempo di reset in ms. Default: 30_000 */
  resetTimeoutMs: number;
}
```

Il "tipo di task" è derivato dall'`instructions` hash (se due task hanno le stesse instructions, sono dello stesso tipo). Se un tipo di task fallisce `failureThreshold` volte nella finestra, il circuit breaker si apre e i dispatch successivi per quel tipo vengono rifiutati con un messaggio esplicativo all'LLM.

### 3.5 Metriche e Observability

Il SubagentRegistry emette metriche attraverso `TelemetryPort` (compatibile con il sistema esistente in `src/ports/telemetry.port.ts`):

| Metrica | Tipo | Descrizione |
|---|---|---|
| `subagent.dispatch.count` | Counter | Task dispatchati |
| `subagent.dispatch.rejected` | Counter | Task rifiutati (quota/backpressure) |
| `subagent.queue.depth` | Gauge | Profondità corrente della coda |
| `subagent.active.count` | Gauge | Subagent attualmente in esecuzione |
| `subagent.completion.duration_ms` | Histogram | Latenza dal dispatch al completamento |
| `subagent.status.{status}` | Counter | Contatore per ogni stato terminale |
| `subagent.token.usage` | Counter | Token consumati da subagent |
| `subagent.pool.utilization` | Gauge | % utilizzo del pool |
| `subagent.pool.size` | Gauge | Dimensione corrente del pool |
| `subagent.circuit_breaker.open` | Counter | Circuit breaker aperti |
| `subagent.gc.collected` | Counter | Handle raccolti dal GC |

Tutte le metriche sono emesse tramite `this.telemetry?.recordMetric()` per compatibilità con l'infrastruttura esistente.

---

## 4. Integrazione con l'Architettura Esistente

### 4.1 Integrazione con ToolManager

Il `ToolManager.buildToolCatalog()` (in `src/agent/tool-manager.ts:92-137`) attualmente registra il `task` tool tramite `createSubagentTools()` (riga 103-114). Con il nuovo sistema:

```typescript
// tool-manager.ts — modifica in buildToolCatalog()
if (this.config.subagents) {
  if (this.config.subagentConfig?.asyncMode) {
    // Nuovo: 3-tool pattern asincrono
    this.registerTools(
      tools,
      createAsyncSubagentTools({
        registry: this.config.subagentRegistry!,
        parentId: this.config.parentId ?? "root",
        maxDepth: this.config.subagentConfig.maxDepth ?? 3,
        currentDepth: this.config.subagentConfig.currentDepth ?? 0,
      }),
      "async-subagents",
    );
  } else {
    // Legacy: tool sincrono (backward compatible)
    this.registerTools(
      tools,
      createSubagentTools({ /* config corrente invariata */ }),
      "subagents",
    );
  }
}
```

Il `ToolManagerConfig` viene esteso con campi opzionali:

```typescript
export interface ToolManagerConfig {
  // ... campi esistenti (righe 30-44 di tool-manager.ts) ...
  subagentRegistry?: SubagentRegistry;
  parentId?: string;
}
```

### 4.2 Integrazione con EventBus

Nuovi eventi da aggiungere ad `AgentEventType` in `src/types.ts` (riga 90-116):

```typescript
// Aggiunte a AgentEventType
| "subagent:dispatch"       // Task accodato nel registry
| "subagent:dequeue"        // Task prelevato dalla coda dallo scheduler
| "subagent:status-change"  // Transizione di stato nella state machine
| "subagent:output-chunk"   // Output parziale ricevuto (per streaming progressivo)
| "subagent:cancelled"      // Task cancellato esplicitamente
| "subagent:timeout"        // Task scaduto per timeout
| "subagent:gc"             // Handle raccolto dal garbage collector
| "subagent:backpressure"   // Coda piena, dispatch rifiutato
| "subagent:circuit-open"   // Circuit breaker aperto per un tipo di task
| "subagent:pool-resize"    // Pool ridimensionato dallo scheduler
```

**Nota**: gli eventi `subagent:spawn` e `subagent:complete` già definiti (riga 105-106 di types.ts) rimangono per backward compatibility, mappati sulle nuove transizioni `queued→running` e `*→completed`.

### 4.3 Integrazione con SharedContext

Il `SharedContext` (in `src/graph/shared-context.ts`) usa `FilesystemPort` per stato condiviso. Il parent può condividere dati con i child attraverso namespace dedicati:

```
SharedContext namespace layout:
/.shared/
├── results/           ← usato da GraphExecutor (invariato, righe 43-49 shared-context.ts)
│   ├── node-a
│   └── node-b
├── subagent/          ← NUOVO: namespace per subagent async
│   ├── {taskId1}/
│   │   ├── input     ← dati che il parent passa al child
│   │   ├── output    ← output finale scritto dal child
│   │   └── scratch/  ← area di lavoro temporanea del child
│   └── {taskId2}/
│       └── ...
└── global/            ← dati condivisi tra tutti (read-only per child)
```

**Regole di accesso**:
- Il child legge `/.shared/global/*` (read-only)
- Il child legge/scrive `/.shared/subagent/{taskId}/*` (proprio namespace)
- Il child **non può** leggere `/.shared/subagent/{altroTaskId}/*`
- Il parent legge qualsiasi namespace

### 4.4 Integrazione con il Plugin System

Hook nuovi da aggiungere a `PluginHooks` (in `src/ports/plugin.port.ts:91-99`):

```typescript
// Estensione a PluginHooks
export interface PluginHooks {
  // ... hooks esistenti (beforeRun, afterRun, etc.) ...

  /** Invocato prima del dispatch di un subagent. Può modificare prompt/priority o bloccare. */
  beforeDispatch?(
    ctx: PluginContext,
    params: {
      prompt: string;
      priority: number;
      metadata: Record<string, unknown>;
    },
  ): Promise<{
    prompt?: string;
    priority?: number;
    skip?: boolean;
    result?: string;
  } | void>;

  /** Invocato dopo il completamento (success/failure) di un subagent. */
  afterSubagentComplete?(
    ctx: PluginContext,
    params: {
      taskId: string;
      status: SubagentTaskStatus;
      output: string | null;
      error: string | null;
      durationMs: number;
    },
  ): Promise<void>;
}
```

**Caso d'uso**: un plugin di guardrails (`src/plugins/guardrails.plugin.ts`) può ispezionare il prompt del subagent prima del dispatch e bloccare task potenzialmente pericolosi o fuori scope.

### 4.5 Retrocompatibilità con TaskTool

Il TaskTool sincrono corrente (`createTaskTool()` in `src/tools/subagent/task.tool.ts`) rimane disponibile e **completamente invariato**. Il nuovo sistema è opt-in:

```typescript
// Vecchio modo (sincrono, bloccante) — continua a funzionare identicamente
const agent = DeepAgent.create(config)
  .withSubagents()  // registra il tool "task" sincrono
  .build();

// Nuovo modo (asincrono, 3-tool) — opt-in esplicito
const agent = DeepAgent.create(config)
  .withAsyncSubagents({  // registra dispatch/poll/await
    limits: { maxConcurrentPerParent: 5, maxDepth: 3 },
    poolConfig: { minWorkers: 2, maxWorkers: 10 },
  })
  .build();
```

I due modi sono **mutuamente esclusivi**: `.withSubagents()` e `.withAsyncSubagents()` non possono coesistere. Il builder lancia errore se entrambi vengono chiamati.

---

## 5. Edge Cases e Failure Modes

### 5.1 Parent muore mentre i figli girano

**Scenario**: Il parent agent raggiunge `maxSteps`, viene cancellato dall'utente, o crasha per un'eccezione non gestita.

**Soluzione**:
1. Il `DeepAgent.dispose()` (riga 270-292 di deep-agent.ts) chiama `registry.cancelAll(parentId)`
2. Il registry itera tutti gli handle con `parentId` matching
3. Ogni handle viene abortato tramite `AbortController.abort()`
4. I timeout timer vengono cancellati
5. Gli handle transizionano a `cancelled`
6. Il GC li raccoglierà dopo `gcTtlMs`

**Safety net — orphan detection**: anche se `dispose()` non viene chiamato (crash), il GC periodico trova handle "orfani" (parent non più attivo) e li cancella. Il registry mantiene un `WeakRef` al parent agent o controlla una mappa di parentId attivi.

```typescript
// Nel GC cycle
for (const handle of this.handles.values()) {
  if (handle.status === "running" || handle.status === "streaming") {
    if (!this.isParentAlive(handle.parentId)) {
      this.cancel(handle.taskId, "orphan-cleanup");
    }
  }
}
```

### 5.2 Child va in loop infinito

**Scenario**: Il child entra in un loop di tool calls che non produce output e non termina.

**Difese a più livelli**:
1. **Timeout**: il timer del handle scade → `AbortController.abort()` → stato `timeout`
2. **maxSteps**: il `ToolLoopAgent` del child ha `stopWhen: stepCountIs(maxStepsPerSubagent)` — al raggiungimento di 20 step, si ferma (come il TaskTool attuale, riga 75)
3. **Token budget**: se il `TokenTracker` del child supera il budget, il prossimo LLM call viene intercettato e l'esecuzione terminata
4. **Watchdog**: il GC periodico controlla se un handle è in `running` da più di `2 * timeoutMs` e lo forza a `timeout` (difesa contro timer handle persi)

### 5.3 Memory Leak da Subagent Non Terminati

**Scenario**: Handle che restano in memoria indefinitamente.

**Difese**:
1. **GC periodico**: ogni `gcIntervalMs` (default: 30s), il GC scansiona tutti gli handle e rimuove quelli in stato terminale con `statusChangedAt + gcTtlMs < now`
2. **Hard limit**: se `handles.size > maxConcurrentGlobal * 10`, il GC diventa aggressivo e rimuove TUTTI gli handle terminali indipendentemente dal TTL
3. **VFS cleanup**: quando un handle viene rimosso dal GC, il `VirtualFilesystem` isolato del child viene dereferenziato → garbage collection JS nativa
4. **Event listener cleanup**: il GC rimuove tutti i completion listener associati all'handle

### 5.4 Race Conditions su SharedContext

**Scenario**: Due child scrivono lo stesso key in `SharedContext` contemporaneamente.

**Analisi**: `SharedContext` usa `FilesystemPort.write()` che nel `VirtualFilesystem` è una `Map.set()` — single-threaded in JS (no vero parallelismo nel thread). Tuttavia con I/O asincrono e `await`, due `await fs.write()` possono interleave.

**Soluzione architetturale**: 
- Il namespace di ogni child è isolato (`/.shared/subagent/{taskId}/`), quindi le collisioni tra child **non avvengono per design**
- `/.shared/global/*` è read-only per i child → nessuna race
- Se necessario, `SharedContext` può essere esteso con un lock per-key basato su Promise chaining:

```typescript
class SharedContextWithLock extends SharedContext {
  private readonly locks = new Map<string, Promise<void>>();

  async setWithLock(key: string, value: unknown): Promise<void> {
    const currentLock = this.locks.get(key) ?? Promise.resolve();
    const newLock = currentLock.then(() => super.set(key, value));
    this.locks.set(key, newLock.then(() => {}));
    await newLock;
  }
}
```

### 5.5 Cascading Failures

**Scenario**: Child A fallisce → Parent ritenta → Child A' fallisce → Parent ritenta → esaurisce steps/tokens.

**Difese**:
1. **Circuit breaker per tipo**: dopo N fallimenti dello stesso tipo di task (stesse instructions), il dispatch viene bloccato con messaggio esplicativo all'LLM
2. **L'LLM vede il pattern**: i fallimenti sono restituiti come testo nel tool result, quindi l'LLM può (e dovrebbe) riconoscere il pattern e cambiare strategia
3. **Token budget**: i retry consumano token → il budget si esaurisce → il parent si ferma
4. **maxSteps del parent**: i retry consumano step → il parent raggiunge il limite e si ferma

**Scenario estremo**: Child C spawna Grandchild C1 che fallisce, causando il fallimento di C, causando il retry del parent.

**Difesa**: `maxDepth` limita la profondità. Il timeout cascading (`effectiveTimeout = min(requestedTimeout, parentRemainingTime)`) assicura che il grandchild non possa mai sopravvivere al nonno.

---

## 6. API Surface — Code Sketches Completi

### 6.1 `SubagentRegistry` Class

```typescript
// =============================================================================
// src/tools/subagent/subagent-registry.ts
// =============================================================================

import type { EventBus } from "../../agent/event-bus.js";
import type { TelemetryPort } from "../../ports/telemetry.port.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubagentTaskStatus =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "failed"
  | "timeout"
  | "cancelled";

const TERMINAL_STATES: ReadonlySet<SubagentTaskStatus> = new Set([
  "completed", "failed", "timeout", "cancelled",
]);

export interface SubagentHandle {
  readonly taskId: string;
  readonly parentId: string;
  readonly depth: number;
  readonly createdAt: number;
  status: SubagentTaskStatus;
  statusChangedAt: number;
  priority: number;
  partialOutput: string;
  finalOutput: string | null;
  error: string | null;
  readonly abortController: AbortController;
  readonly prompt: string;
  readonly instructions: string | null;
  readonly timeoutMs: number;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  tokenUsage: { input: number; output: number };
  readonly metadata: Record<string, unknown>;
}

export interface SubagentResourceLimits {
  maxConcurrentPerParent: number;
  maxConcurrentGlobal: number;
  maxDepth: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  maxQueueSize: number;
  gcTtlMs: number;
  gcIntervalMs: number;
  maxStepsPerSubagent: number;
}

export interface DispatchParams {
  prompt: string;
  instructions?: string;
  priority?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_LIMITS: SubagentResourceLimits = {
  maxConcurrentPerParent: 5,
  maxConcurrentGlobal: 50,
  maxDepth: 3,
  defaultTimeoutMs: 300_000,
  maxTimeoutMs: 600_000,
  maxQueueSize: 100,
  gcTtlMs: 60_000,
  gcIntervalMs: 30_000,
  maxStepsPerSubagent: 20,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SubagentQueueFullError extends Error {
  constructor(queueSize: number, maxSize: number) {
    super(
      `Subagent queue is full (${queueSize}/${maxSize}). ` +
      `Try again after some tasks complete.`,
    );
    this.name = "SubagentQueueFullError";
  }
}

export class SubagentDepthExceededError extends Error {
  constructor(currentDepth: number, maxDepth: number) {
    super(`Maximum subagent nesting depth exceeded (${currentDepth}/${maxDepth}).`);
    this.name = "SubagentDepthExceededError";
  }
}

export class SubagentQuotaExceededError extends Error {
  constructor(parentId: string, reason: string) {
    super(`Quota exceeded for parent "${parentId}": ${reason}`);
    this.name = "SubagentQuotaExceededError";
  }
}

// ---------------------------------------------------------------------------
// Forward declaration for bidirectional reference
// ---------------------------------------------------------------------------

interface Schedulable {
  enqueue(handle: SubagentHandle): void;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class SubagentRegistry {
  private readonly handles = new Map<string, SubagentHandle>();
  private readonly parentIndex = new Map<string, Set<string>>();
  private readonly limits: SubagentResourceLimits;
  private readonly eventBus: EventBus;
  private readonly telemetry?: TelemetryPort;
  private readonly generateId: () => string;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  /** Listeners waiting for a specific task to reach terminal state */
  private readonly completionListeners = new Map<
    string,
    Array<(handle: SubagentHandle) => void>
  >();

  /** Scheduler reference — set via setScheduler() after construction */
  private scheduler: Schedulable | null = null;

  constructor(
    eventBus: EventBus,
    options?: {
      limits?: Partial<SubagentResourceLimits>;
      telemetry?: TelemetryPort;
      generateId?: () => string;
    },
  ) {
    this.eventBus = eventBus;
    this.limits = { ...DEFAULT_LIMITS, ...options?.limits };
    this.telemetry = options?.telemetry;
    this.generateId = options?.generateId ?? (() => crypto.randomUUID());
  }

  /** Wire the scheduler (called during setup) */
  setScheduler(scheduler: Schedulable): void {
    this.scheduler = scheduler;
  }

  get resourceLimits(): Readonly<SubagentResourceLimits> {
    return this.limits;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    this.gcTimer = setInterval(() => this.gc(), this.limits.gcIntervalMs);
  }

  async shutdown(): Promise<void> {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    for (const handle of this.handles.values()) {
      if (!TERMINAL_STATES.has(handle.status)) {
        this.cancel(handle.taskId, "registry-shutdown");
      }
    }
    this.handles.clear();
    this.parentIndex.clear();
    this.completionListeners.clear();
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  dispatch(parentId: string, currentDepth: number, params: DispatchParams): SubagentHandle {
    if (currentDepth >= this.limits.maxDepth) {
      throw new SubagentDepthExceededError(currentDepth, this.limits.maxDepth);
    }

    const parentHandles = this.parentIndex.get(parentId);
    const parentActive = parentHandles
      ? [...parentHandles].filter((id) => {
          const h = this.handles.get(id);
          return h && !TERMINAL_STATES.has(h.status);
        }).length
      : 0;

    if (parentActive >= this.limits.maxConcurrentPerParent) {
      throw new SubagentQuotaExceededError(
        parentId,
        `max concurrent per parent (${this.limits.maxConcurrentPerParent}) reached`,
      );
    }

    const queuedCount = [...this.handles.values()].filter(
      (h) => h.status === "queued",
    ).length;

    if (queuedCount >= this.limits.maxQueueSize) {
      throw new SubagentQueueFullError(queuedCount, this.limits.maxQueueSize);
    }

    const timeoutMs = Math.min(
      params.timeoutMs ?? this.limits.defaultTimeoutMs,
      this.limits.maxTimeoutMs,
    );

    const handle: SubagentHandle = {
      taskId: this.generateId(),
      parentId,
      depth: currentDepth,
      createdAt: Date.now(),
      status: "queued",
      statusChangedAt: Date.now(),
      priority: params.priority ?? 5,
      partialOutput: "",
      finalOutput: null,
      error: null,
      abortController: new AbortController(),
      prompt: params.prompt,
      instructions: params.instructions ?? null,
      timeoutMs,
      timeoutTimer: null,
      tokenUsage: { input: 0, output: 0 },
      metadata: params.metadata ?? {},
    };

    this.handles.set(handle.taskId, handle);
    if (!this.parentIndex.has(parentId)) {
      this.parentIndex.set(parentId, new Set());
    }
    this.parentIndex.get(parentId)!.add(handle.taskId);

    this.eventBus.emit("subagent:spawn", {
      taskId: handle.taskId,
      parentId,
      depth: currentDepth,
      prompt: params.prompt,
      priority: handle.priority,
    });
    this.telemetry?.recordMetric("subagent.dispatch.count", 1);

    this.scheduler?.enqueue(handle);
    return handle;
  }

  // -------------------------------------------------------------------------
  // Status Transitions
  // -------------------------------------------------------------------------

  transition(
    taskId: string,
    newStatus: SubagentTaskStatus,
    data?: { partialOutput?: string; finalOutput?: string; error?: string },
  ): void {
    const handle = this.handles.get(taskId);
    if (!handle) return;
    if (TERMINAL_STATES.has(handle.status)) return;

    const previousStatus = handle.status;
    handle.status = newStatus;
    handle.statusChangedAt = Date.now();

    if (data?.partialOutput !== undefined) {
      handle.partialOutput += data.partialOutput;
    }
    if (data?.finalOutput !== undefined) {
      handle.finalOutput = data.finalOutput;
    }
    if (data?.error !== undefined) {
      handle.error = data.error;
    }

    this.eventBus.emit("subagent:status-change" as any, {
      taskId,
      previousStatus,
      newStatus,
      parentId: handle.parentId,
    });

    if (TERMINAL_STATES.has(newStatus)) {
      if (handle.timeoutTimer) {
        clearTimeout(handle.timeoutTimer);
        handle.timeoutTimer = null;
      }

      this.eventBus.emit("subagent:complete", {
        taskId,
        status: newStatus,
        parentId: handle.parentId,
        durationMs: Date.now() - handle.createdAt,
        tokenUsage: handle.tokenUsage,
      });
      this.telemetry?.recordMetric(`subagent.status.${newStatus}`, 1);
      this.telemetry?.recordMetric(
        "subagent.completion.duration_ms",
        Date.now() - handle.createdAt,
      );

      const listeners = this.completionListeners.get(taskId);
      if (listeners) {
        for (const cb of listeners) cb(handle);
        this.completionListeners.delete(taskId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Query
  // -------------------------------------------------------------------------

  get(taskId: string): SubagentHandle | undefined {
    return this.handles.get(taskId);
  }

  getByParent(parentId: string): SubagentHandle[] {
    const ids = this.parentIndex.get(parentId);
    if (!ids) return [];
    return [...ids].map((id) => this.handles.get(id)!).filter(Boolean);
  }

  get activeCount(): number {
    return [...this.handles.values()].filter(
      (h) => h.status === "running" || h.status === "streaming",
    ).length;
  }

  get queuedCount(): number {
    return [...this.handles.values()].filter((h) => h.status === "queued").length;
  }

  get totalCount(): number {
    return this.handles.size;
  }

  // -------------------------------------------------------------------------
  // Await
  // -------------------------------------------------------------------------

  waitForCompletion(taskId: string, timeoutMs: number): Promise<SubagentHandle> {
    const handle = this.handles.get(taskId);
    if (!handle) {
      return Promise.reject(new Error(`Task "${taskId}" not found`));
    }
    if (TERMINAL_STATES.has(handle.status)) {
      return Promise.resolve(handle);
    }

    return new Promise<SubagentHandle>((resolve) => {
      const timer = setTimeout(() => {
        const listeners = this.completionListeners.get(taskId);
        if (listeners) {
          const idx = listeners.indexOf(onComplete);
          if (idx !== -1) listeners.splice(idx, 1);
        }
        resolve(handle);
      }, timeoutMs);

      const onComplete = (h: SubagentHandle) => {
        clearTimeout(timer);
        resolve(h);
      };

      if (!this.completionListeners.has(taskId)) {
        this.completionListeners.set(taskId, []);
      }
      this.completionListeners.get(taskId)!.push(onComplete);
    });
  }

  // -------------------------------------------------------------------------
  // Cancellation
  // -------------------------------------------------------------------------

  cancel(taskId: string, reason = "cancelled"): boolean {
    const handle = this.handles.get(taskId);
    if (!handle || TERMINAL_STATES.has(handle.status)) return false;

    handle.abortController.abort(reason);
    this.transition(taskId, "cancelled", { error: reason });

    // Cascade to children that have this task as parent
    for (const h of this.handles.values()) {
      if (h.parentId === taskId && !TERMINAL_STATES.has(h.status)) {
        this.cancel(h.taskId, `parent-cancelled:${reason}`);
      }
    }

    return true;
  }

  cancelAll(parentId: string): number {
    let count = 0;
    const ids = this.parentIndex.get(parentId);
    if (!ids) return 0;
    for (const id of ids) {
      if (this.cancel(id, "parent-shutdown")) count++;
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // Garbage Collection
  // -------------------------------------------------------------------------

  private gc(): void {
    const now = Date.now();
    let collected = 0;

    for (const [taskId, handle] of this.handles) {
      // Collect terminal handles past TTL
      if (
        TERMINAL_STATES.has(handle.status) &&
        now - handle.statusChangedAt > this.limits.gcTtlMs
      ) {
        this.handles.delete(taskId);
        this.parentIndex.get(handle.parentId)?.delete(taskId);
        this.completionListeners.delete(taskId);
        collected++;
      }

      // Watchdog: force-timeout stuck handles (2x timeout)
      if (
        (handle.status === "running" || handle.status === "streaming") &&
        now - handle.createdAt > handle.timeoutMs * 2
      ) {
        this.cancel(taskId, "watchdog-timeout");
      }
    }

    // Aggressive GC when handle count is excessive
    if (this.handles.size > this.limits.maxConcurrentGlobal * 10) {
      for (const [taskId, handle] of this.handles) {
        if (TERMINAL_STATES.has(handle.status)) {
          this.handles.delete(taskId);
          this.parentIndex.get(handle.parentId)?.delete(taskId);
          this.completionListeners.delete(taskId);
          collected++;
        }
      }
    }

    if (collected > 0) {
      this.telemetry?.recordMetric("subagent.gc.collected", collected);
    }

    this.telemetry?.recordMetric("subagent.queue.depth", this.queuedCount);
    this.telemetry?.recordMetric("subagent.active.count", this.activeCount);
  }
}
```

### 6.2 `SubagentScheduler` con Priority Queue

```typescript
// =============================================================================
// src/tools/subagent/subagent-scheduler.ts
// =============================================================================

import { ToolLoopAgent, stepCountIs } from "ai";
import type { LanguageModel } from "ai";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import type { TelemetryPort } from "../../ports/telemetry.port.js";
import { VirtualFilesystem } from "../../adapters/filesystem/virtual-fs.adapter.js";
import { createFilesystemTools } from "../filesystem/index.js";
import {
  SubagentRegistry,
  type SubagentHandle,
  type SubagentResourceLimits,
} from "./subagent-registry.js";

// ---------------------------------------------------------------------------
// Pool Config
// ---------------------------------------------------------------------------

export interface PoolConfig {
  minWorkers: number;
  maxWorkers: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  resizeCooldownMs: number;
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  minWorkers: 2,
  maxWorkers: 20,
  scaleUpThreshold: 0.8,
  scaleDownThreshold: 0.3,
  resizeCooldownMs: 10_000,
};

// ---------------------------------------------------------------------------
// Priority Queue (binary min-heap with aging)
// ---------------------------------------------------------------------------

interface QueueEntry {
  handle: SubagentHandle;
  effectivePriority: number;
  enqueuedAt: number;
}

class PriorityQueue {
  private heap: QueueEntry[] = [];
  private readonly agingIntervalMs: number;

  constructor(agingIntervalMs = 5_000) {
    this.agingIntervalMs = agingIntervalMs;
  }

  get size(): number {
    return this.heap.length;
  }

  enqueue(handle: SubagentHandle): void {
    const entry: QueueEntry = {
      handle,
      effectivePriority: handle.priority,
      enqueuedAt: Date.now(),
    };
    this.heap.push(entry);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): SubagentHandle | null {
    if (this.heap.length === 0) return null;
    this.refreshPriorities();

    const top = this.heap[0]!;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top.handle;
  }

  peek(): SubagentHandle | null {
    return this.heap.length > 0 ? this.heap[0]!.handle : null;
  }

  remove(taskId: string): boolean {
    const idx = this.heap.findIndex((e) => e.handle.taskId === taskId);
    if (idx === -1) return false;
    const last = this.heap.pop()!;
    if (idx < this.heap.length) {
      this.heap[idx] = last;
      this.bubbleUp(idx);
      this.sinkDown(idx);
    }
    return true;
  }

  private refreshPriorities(): void {
    const now = Date.now();
    let dirty = false;
    for (const entry of this.heap) {
      const ageBonus = Math.floor((now - entry.enqueuedAt) / this.agingIntervalMs);
      const newPriority = Math.max(1, entry.handle.priority - ageBonus);
      if (newPriority !== entry.effectivePriority) {
        entry.effectivePriority = newPriority;
        dirty = true;
      }
    }
    if (dirty) {
      // Rebuild heap: simpler than selective fix-up for aging
      for (let i = Math.floor(this.heap.length / 2) - 1; i >= 0; i--) {
        this.sinkDown(i);
      }
    }
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.heap[parentIdx]!.effectivePriority <= this.heap[idx]!.effectivePriority) break;
      [this.heap[parentIdx]!, this.heap[idx]!] = [this.heap[idx]!, this.heap[parentIdx]!];
      idx = parentIdx;
    }
  }

  private sinkDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < length && this.heap[left]!.effectivePriority < this.heap[smallest]!.effectivePriority) {
        smallest = left;
      }
      if (right < length && this.heap[right]!.effectivePriority < this.heap[smallest]!.effectivePriority) {
        smallest = right;
      }
      if (smallest === idx) break;
      [this.heap[smallest]!, this.heap[idx]!] = [this.heap[idx]!, this.heap[smallest]!];
      idx = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker state per task type
// ---------------------------------------------------------------------------

interface TaskTypeCircuitState {
  failures: number[];
  state: "closed" | "open" | "half-open";
  lastFailure: number;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class SubagentScheduler {
  private readonly registry: SubagentRegistry;
  private readonly queue: PriorityQueue;
  private readonly poolConfig: PoolConfig;
  private readonly model: LanguageModel;
  private readonly limits: SubagentResourceLimits;
  private readonly telemetry?: TelemetryPort;

  private currentPoolSize: number;
  private activeWorkers = 0;
  private lastResizeAt = 0;
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  private readonly circuitBreakers = new Map<string, TaskTypeCircuitState>();
  private readonly cbConfig = {
    failureThreshold: 3,
    monitorWindowMs: 60_000,
    resetTimeoutMs: 30_000,
  };

  constructor(
    registry: SubagentRegistry,
    model: LanguageModel,
    limits: SubagentResourceLimits,
    options?: {
      poolConfig?: Partial<PoolConfig>;
      telemetry?: TelemetryPort;
    },
  ) {
    this.registry = registry;
    this.model = model;
    this.limits = limits;
    this.poolConfig = { ...DEFAULT_POOL_CONFIG, ...options?.poolConfig };
    this.telemetry = options?.telemetry;
    this.queue = new PriorityQueue();
    this.currentPoolSize = this.poolConfig.minWorkers;

    registry.setScheduler(this);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    this.drainTimer = setInterval(() => this.drain(), 100);
  }

  async shutdown(): Promise<void> {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Enqueue (called by registry on dispatch)
  // -------------------------------------------------------------------------

  enqueue(handle: SubagentHandle): void {
    this.queue.enqueue(handle);
    this.drain();
  }

  // -------------------------------------------------------------------------
  // Drain loop
  // -------------------------------------------------------------------------

  private drain(): void {
    while (this.queue.size > 0 && this.activeWorkers < this.currentPoolSize) {
      const handle = this.queue.dequeue();
      if (!handle) break;

      if (handle.abortController.signal.aborted) {
        this.registry.transition(handle.taskId, "cancelled", {
          error: "cancelled-while-queued",
        });
        continue;
      }

      const taskType = this.getTaskType(handle);
      if (this.isCircuitOpen(taskType)) {
        this.registry.transition(handle.taskId, "failed", {
          error: "Circuit breaker open for this task type. Too many recent failures.",
        });
        continue;
      }

      this.activeWorkers++;
      this.executeHandle(handle).finally(() => {
        this.activeWorkers--;
        this.maybeResize();
        this.drain();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Execute a single handle
  // -------------------------------------------------------------------------

  private async executeHandle(handle: SubagentHandle): Promise<void> {
    this.registry.transition(handle.taskId, "running");

    const subVfs = new VirtualFilesystem();
    const fsTools = createFilesystemTools(subVfs);

    handle.timeoutTimer = setTimeout(() => {
      handle.abortController.abort("timeout");
      this.registry.transition(handle.taskId, "timeout", {
        error: `Subagent timed out after ${handle.timeoutMs}ms`,
      });
    }, handle.timeoutMs);

    const agent = new ToolLoopAgent({
      model: this.model,
      instructions:
        handle.instructions ??
        "You are a specialized subagent. Complete the task and return your findings.",
      tools: { ...fsTools },
      stopWhen: stepCountIs(this.limits.maxStepsPerSubagent),
    });

    try {
      const result = await agent.generate({
        prompt: handle.prompt,
        signal: handle.abortController.signal,
      });

      const output = result.text || "[Subagent completed with no text output]";

      const usage = (result as any).usage;
      if (usage) {
        handle.tokenUsage.input += usage.promptTokens ?? 0;
        handle.tokenUsage.output += usage.completionTokens ?? 0;
      }

      this.registry.transition(handle.taskId, "completed", { finalOutput: output });
      this.recordSuccess(this.getTaskType(handle));
    } catch (error: unknown) {
      if (handle.abortController.signal.aborted) return;

      const message = error instanceof Error ? error.message : String(error);
      this.registry.transition(handle.taskId, "failed", { error: message });
      this.recordFailure(this.getTaskType(handle));
    }
  }

  // -------------------------------------------------------------------------
  // Pool Sizing
  // -------------------------------------------------------------------------

  private maybeResize(): void {
    const now = Date.now();
    if (now - this.lastResizeAt < this.poolConfig.resizeCooldownMs) return;

    const utilization =
      this.currentPoolSize > 0 ? this.activeWorkers / this.currentPoolSize : 0;

    let newSize = this.currentPoolSize;
    if (utilization > this.poolConfig.scaleUpThreshold) {
      newSize = Math.min(Math.ceil(this.currentPoolSize * 1.5), this.poolConfig.maxWorkers);
    } else if (utilization < this.poolConfig.scaleDownThreshold) {
      newSize = Math.max(Math.floor(this.currentPoolSize * 0.75), this.poolConfig.minWorkers);
    }

    if (newSize !== this.currentPoolSize) {
      this.currentPoolSize = newSize;
      this.lastResizeAt = now;
      this.telemetry?.recordMetric("subagent.pool.size", newSize);
    }
    this.telemetry?.recordMetric("subagent.pool.utilization", utilization);
  }

  // -------------------------------------------------------------------------
  // Circuit Breaker per task type
  // -------------------------------------------------------------------------

  private getTaskType(handle: SubagentHandle): string {
    return handle.instructions ?? "__default__";
  }

  private isCircuitOpen(taskType: string): boolean {
    const state = this.circuitBreakers.get(taskType);
    if (!state) return false;
    if (state.state === "open") {
      if (Date.now() - state.lastFailure > this.cbConfig.resetTimeoutMs) {
        state.state = "half-open";
        return false;
      }
      return true;
    }
    return false;
  }

  private recordFailure(taskType: string): void {
    const now = Date.now();
    let state = this.circuitBreakers.get(taskType);
    if (!state) {
      state = { failures: [], state: "closed", lastFailure: 0 };
      this.circuitBreakers.set(taskType, state);
    }
    state.failures.push(now);
    state.lastFailure = now;
    state.failures = state.failures.filter((t) => now - t < this.cbConfig.monitorWindowMs);

    if (state.failures.length >= this.cbConfig.failureThreshold) {
      state.state = "open";
      this.telemetry?.recordMetric("subagent.circuit_breaker.open", 1);
    }
  }

  private recordSuccess(taskType: string): void {
    const state = this.circuitBreakers.get(taskType);
    if (state?.state === "half-open") {
      state.state = "closed";
      state.failures = [];
    }
  }
}
```

### 6.3 I 3 Tool (dispatch/poll/await)

```typescript
// =============================================================================
// src/tools/subagent/async-subagent-tools.ts
// =============================================================================

import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

import type { SubagentRegistry } from "./subagent-registry.js";
import {
  SubagentQueueFullError,
  SubagentDepthExceededError,
  SubagentQuotaExceededError,
} from "./subagent-registry.js";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const DispatchSubagentInputSchema = z.object({
  prompt: z.string().min(1).max(10_000).describe("Task description for the subagent"),
  instructions: z.string().max(5_000).optional().describe("Optional system instructions"),
  priority: z.number().int().min(1).max(10).default(5).describe("Priority 1-10 (1=highest)"),
  timeoutMs: z.number().int().min(5_000).max(600_000).optional().describe("Timeout in ms"),
  metadata: z.record(z.string(), z.unknown()).optional().describe("Optional metadata"),
});

const PollSubagentInputSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(50).describe("Task IDs to check"),
  includePartialOutput: z.boolean().default(true).describe("Include partial streaming output"),
  maxPartialOutputLength: z.number().int().min(0).max(10_000).default(2_000)
    .describe("Max chars of partial output per task"),
});

const AwaitSubagentInputSchema = z.object({
  taskId: z.string().uuid().describe("Task ID to wait for"),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(300_000)
    .describe("Max wait time in ms"),
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface AsyncSubagentToolsConfig {
  registry: SubagentRegistry;
  parentId: string;
  maxDepth: number;
  currentDepth: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAsyncSubagentTools(
  config: AsyncSubagentToolsConfig,
): Record<string, Tool> {
  const { registry, parentId, currentDepth } = config;

  // =======================================================================
  // Tool 1: dispatch_subagent
  // =======================================================================
  const dispatchSubagent = tool({
    description:
      "Dispatch a subtask to a specialized subagent. Returns immediately with a taskId. " +
      "Use poll_subagent to check progress, or await_subagent to wait for completion. " +
      "You can dispatch multiple tasks in a single step for parallel execution.",
    inputSchema: DispatchSubagentInputSchema,
    execute: async (input): Promise<string> => {
      try {
        const handle = registry.dispatch(parentId, currentDepth, {
          prompt: input.prompt,
          instructions: input.instructions,
          priority: input.priority,
          timeoutMs: input.timeoutMs,
          metadata: input.metadata,
        });

        return JSON.stringify({
          taskId: handle.taskId,
          status: "queued",
          queuePosition: registry.queuedCount,
          message: "Task dispatched. Use poll_subagent or await_subagent to get results.",
        });
      } catch (error: unknown) {
        if (
          error instanceof SubagentQueueFullError ||
          error instanceof SubagentDepthExceededError ||
          error instanceof SubagentQuotaExceededError
        ) {
          return JSON.stringify({ error: error.message });
        }
        const msg = error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: `Dispatch failed: ${msg}` });
      }
    },
  });

  // =======================================================================
  // Tool 2: poll_subagent
  // =======================================================================
  const pollSubagent = tool({
    description:
      "Check the status of dispatched subtasks. Returns current status and partial output. " +
      "Never blocks — returns immediately.",
    inputSchema: PollSubagentInputSchema,
    execute: async (input): Promise<string> => {
      const summary = {
        total: 0, queued: 0, running: 0, streaming: 0,
        completed: 0, failed: 0, timeout: 0, cancelled: 0,
      };

      const tasks = input.taskIds.map((taskId) => {
        summary.total++;
        const handle = registry.get(taskId);
        if (!handle) {
          return { taskId, status: "not_found", error: "Task not found", durationMs: 0 };
        }

        const status = handle.status;
        if (status in summary) (summary as any)[status]++;

        const result: Record<string, unknown> = {
          taskId,
          status,
          durationMs: Date.now() - handle.createdAt,
        };

        if (
          input.includePartialOutput &&
          (status === "streaming" || status === "running") &&
          handle.partialOutput
        ) {
          result.partialOutput = handle.partialOutput.slice(-input.maxPartialOutputLength);
        }

        if (status === "completed" && handle.finalOutput) {
          result.finalOutput = handle.finalOutput;
        }

        if ((status === "failed" || status === "timeout" || status === "cancelled") && handle.error) {
          result.error = handle.error;
        }

        if (handle.tokenUsage.input > 0 || handle.tokenUsage.output > 0) {
          result.tokenUsage = handle.tokenUsage;
        }

        return result;
      });

      return JSON.stringify({ tasks, summary }, null, 2);
    },
  });

  // =======================================================================
  // Tool 3: await_subagent
  // =======================================================================
  const awaitSubagent = tool({
    description:
      "Wait for a specific subtask to complete. Blocks until done, timed out, or cancelled. " +
      "Use poll_subagent for non-blocking checks.",
    inputSchema: AwaitSubagentInputSchema,
    execute: async (input): Promise<string> => {
      const handle = registry.get(input.taskId);
      if (!handle) {
        return JSON.stringify({
          taskId: input.taskId,
          status: "not_found",
          error: "Task not found. It may have been garbage collected.",
        });
      }

      const resolved = await registry.waitForCompletion(input.taskId, input.timeoutMs);

      return JSON.stringify({
        taskId: resolved.taskId,
        status: resolved.status,
        output: resolved.finalOutput ?? undefined,
        error: resolved.error ?? undefined,
        durationMs: Date.now() - resolved.createdAt,
        tokenUsage: resolved.tokenUsage,
      });
    },
  });

  return {
    dispatch_subagent: dispatchSubagent,
    poll_subagent: pollSubagent,
    await_subagent: awaitSubagent,
  };
}
```

### 6.4 Integrazione nel `DeepAgentBuilder` (`.withAsyncSubagents()`)

```typescript
// =============================================================================
// Estensione a src/agent/deep-agent-builder.ts
// =============================================================================
// Le seguenti modifiche vanno integrate nel builder esistente.

import type { SubagentResourceLimits } from "../tools/subagent/subagent-registry.js";
import type { PoolConfig } from "../tools/subagent/subagent-scheduler.js";

export interface AsyncSubagentConfig {
  limits?: Partial<SubagentResourceLimits>;
  poolConfig?: Partial<PoolConfig>;
}

// --- Nuovo campo nella classe ---
// private asyncSubagentConfig?: AsyncSubagentConfig;

// --- Nuovo metodo ---
/*
  withAsyncSubagents(config?: AsyncSubagentConfig): this {
    if (this.subagents) {
      throw new Error(
        "Cannot use both withSubagents() and withAsyncSubagents(). " +
        "Choose sync (withSubagents) or async (withAsyncSubagents) mode.",
      );
    }
    this.asyncSubagentConfig = config ?? {};
    // Set subagents flag so ToolManager knows to register tools
    this.subagents = true;
    this.subagentConfig = {
      ...this.subagentConfig,
      asyncMode: true,
      ...config?.limits,
    };
    return this;
  }
*/

// --- Modifica a construct() ---
// Dopo la creazione dell'agent, se asyncSubagentConfig è impostato:
/*
  if (this.asyncSubagentConfig) {
    const { SubagentRegistry } = await import("../tools/subagent/subagent-registry.js");
    const { SubagentScheduler } = await import("../tools/subagent/subagent-scheduler.js");

    const registry = new SubagentRegistry(agent.eventBus, {
      limits: this.asyncSubagentConfig.limits,
      telemetry: this.telemetryAdapter,
    });

    const limits = { ...DEFAULT_LIMITS, ...this.asyncSubagentConfig.limits };
    const scheduler = new SubagentScheduler(
      registry, this.agentConfig.model, limits,
      { poolConfig: this.asyncSubagentConfig.poolConfig, telemetry: this.telemetryAdapter },
    );

    registry.start();
    scheduler.start();

    // Wire cleanup
    const originalDispose = agent.dispose.bind(agent);
    agent.dispose = async () => {
      await scheduler.shutdown();
      await registry.shutdown();
      await originalDispose();
    };
  }
*/
```

### 6.5 Esempio Completo End-to-End

```typescript
import { openai } from "@ai-sdk/openai";
import { DeepAgent } from "@giulio-leone/gaussflow-agent";

// --- Crea un coordinator con async subagents ---
const coordinator = DeepAgent.create({
  model: openai("gpt-4o"),
  instructions: `
    You are a research coordinator. When given a topic:
    1. Use dispatch_subagent to send 3 parallel research tasks
    2. Use poll_subagent to monitor progress
    3. Use await_subagent to collect final results
    4. Synthesize the findings into a comprehensive report
  `,
})
  .withAsyncSubagents({
    limits: {
      maxConcurrentPerParent: 5,
      maxConcurrentGlobal: 20,
      maxDepth: 2,
      defaultTimeoutMs: 120_000,
    },
    poolConfig: {
      minWorkers: 3,
      maxWorkers: 10,
    },
  })
  .withPlanning()
  .on("subagent:spawn", (e) => console.log("[spawn]", e.data))
  .on("subagent:complete", (e) => console.log("[done]", e.data))
  .build();

// --- Esegui ---
const result = await coordinator.run(
  "Research the impact of AI on healthcare in 2025",
);
console.log(result.text);

// --- Cleanup ---
await coordinator.dispose();
```

**Flusso LLM previsto:**

```
Step 1 (3 parallel tool calls — dispatch batch):
  → dispatch_subagent({prompt: "Research AI diagnostics in healthcare 2025"})
  → dispatch_subagent({prompt: "Research AI drug discovery breakthroughs 2025"})
  → dispatch_subagent({prompt: "Research AI administrative automation in healthcare"})
  ← {taskId: "a1", status: "queued"}
  ← {taskId: "a2", status: "queued"}
  ← {taskId: "a3", status: "queued"}

Step 2 (poll for progress):
  → poll_subagent({taskIds: ["a1", "a2", "a3"]})
  ← {summary: {completed: 1, streaming: 1, running: 1}}

Step 3 (collect remaining results):
  → await_subagent({taskId: "a2"})
  → await_subagent({taskId: "a3"})
  ← {status: "completed", output: "..."}
  ← {status: "completed", output: "..."}

Step 4: LLM sintetizza tutti i risultati in un report strutturato
```

---

## Appendice A: Decision Log

| Decisione | Alternativa Scartata | Motivazione |
|---|---|---|
| 3 tool separati | Singolo tool con `action` param | L'LLM distingue meglio tool con nomi diversi; il dispatch multiplo è nativo del protocol AI SDK |
| Priority queue con aging | FIFO semplice | Starvation prevention necessaria con 100+ task |
| Errori come stringhe nel tool result | Eccezioni propagate al parent | L'LLM deve poter decidere come gestire ogni errore, non crashare |
| VFS isolato per child | SharedContext condiviso | Isolation by default previene side-effect inattesi |
| GC periodico con watchdog | Reference counting | Più semplice, meno bug, adeguato per scala ~100 task |
| Circuit breaker per instructions hash | Per prompt hash | L'instructions identifica il "tipo" di task; il prompt è sempre diverso |
| Pool sizing dinamico con cooldown | Pool fisso | Previene spreco di risorse quando il carico è basso |
| Mutua esclusione sync/async | Coesistenza | Evita confusione nell'LLM su quale tool usare |

## Appendice B: Migration Path

| Versione | Azione |
|---|---|
| **v1.3.0** | Aggiungi `SubagentRegistry`, `SubagentScheduler`, 3 tool. Tutto dietro `.withAsyncSubagents()` opt-in. Zero breaking changes. |
| **v1.4.0** | Aggiungi eventi nuovi ad `AgentEventType`, hook plugin `beforeDispatch`/`afterSubagentComplete`. |
| **v1.5.0** | Depreca `withSubagents()` (sync) con `console.warn` a runtime. |
| **v2.0.0** | Rimuovi `TaskTool` sincrono. `.withAsyncSubagents()` rinominato a `.withSubagents()`. |

## Appendice C: File Layout Proposto

```
src/tools/subagent/
├── index.ts                    ← re-export (aggiornato)
├── task.tool.ts                ← INVARIATO (legacy sync)
├── subagent-registry.ts        ← NUOVO: SubagentRegistry
├── subagent-scheduler.ts       ← NUOVO: SubagentScheduler + PriorityQueue
├── async-subagent-tools.ts     ← NUOVO: dispatch/poll/await tool factory
└── subagent-schemas.ts         ← NUOVO: Zod schemas condivisi
```
