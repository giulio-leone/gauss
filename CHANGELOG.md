# Changelog

All notable changes to **Gauss** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.5.0] - 2025-07-19

### 🚀 npm Publication & Package Rename

- **Package renamed** from `@giulio-leone/gauss` to `@gauss/flow`
- **Public npm registry** — switched from GitHub Packages to npmjs.com (`"access": "public"`)
- Added comprehensive `keywords` for discoverability
- Added `engines` field (`node >= 18`)
- Added `sideEffects: false` for tree-shaking
- Added `./plugins` export path
- Expanded `files` to include `CHANGELOG.md`
- Added `homepage`, `bugs`, `author` metadata
- Created MIT LICENSE file
- Created `.npmignore` for clean publishes
- Updated README with npm badges and `@gauss/flow` import paths

### 📦 Barrel Export Enhancements

- Exported `ServerAdapterPort` from `server.port`
- Exported `SaveQueuePort`, `BundlerPort`, `ContainerPort` (DI) ports
- Exported `createTripWireMiddleware`, `createPromptCachingMiddleware`, `createToolCallPatchingMiddleware`
- Exported `DocGenerator` from `docs/doc-generator`

## [3.4.0] - 2025-07-19

### 🛡️ Trip-Wire & Prompt Caching Middleware

- **Trip-wire middleware** — safety guardrails with violation detection
- **Prompt caching middleware** — reduce redundant LLM calls
- **Tool call patching middleware** — runtime tool call transformation

## [3.3.0] - 2025-07-18

### 🔌 DI Container & Bundler Ports

- **ContainerPort** — dependency injection with lifetime management (singleton/transient/scoped)
- **BundlerPort** — agent bundle compilation and analysis
- **SaveQueuePort** — batched persistence with flush semantics
- **ServerAdapterPort** — wrap agents as HTTP endpoints

## [3.2.0] - 2025-07-18

### 📝 Doc Generator & Compiler Enhancements

- **DocGenerator** — auto-generate API documentation from source
- **LLMCompilerEngine** — natural language to workflow compilation
- **DualWorkflowStorage** — JSON + Markdown dual-format persistence
- Enhanced compiler schema with triggers, channels, and policies

## [3.1.0] - 2025-07-18

### 🏗️ Architecture Refinements

- Hexagonal architecture ports expanded to 50+ contracts
- Plugin marketplace with GitHub + npm registry adapters
- Composite marketplace adapter for multi-source discovery
- Plugin loader with sandboxed execution

## [3.0.0] - 2025-07-18

### 🎉 Major Release — Complete Framework Overhaul

#### Breaking Changes
- Package name changed to `@gauss/flow`
- Minimum Node.js version raised to 18
- Published to public npm registry (was GitHub Packages)

#### Added
- **Evaluation harness** — semantic search quality gates, benchmarks, stress tests
- **Scorer pipeline** — composable evaluation with exact match, contains, LLM judge
- **Trajectory recording** — step-by-step agent execution capture and replay
- **Advanced middleware** — trip-wire, prompt caching, tool call patching, observational memory, result eviction, summarization
- **Sandbox adapters** — E2B cloud sandbox + local shell execution
- **Plugin marketplace** — GitHub/npm registry discovery, composite adapter, plugin loader

## [2.4.0] - 2025-07-18

### 🔧 SDK Fork (gauss-sdk)

- Forked Vercel AI SDK as `@giulio-leone/gauss-sdk` with 30 merged bug fixes
- Published `@giulio-leone/gauss-sdk@1.0.0` to GitHub Package Registry
- Switched dependency from `ai@^6.0.86` to `npm:@giulio-leone/gauss-sdk@^1.0.0`
- Zero import changes required — uses npm alias for seamless drop-in replacement

### Bug Fixes Included (from fork)

- **feat(core)**: Top-level thinking configuration for reasoning models
- **fix(ai)**: Throw AbortError from generateText instead of silently swallowing
- **fix(ai)**: Guard toolResultsStreamController against enqueue/close on closed controller
- **fix(ai)**: Preserve caller tool dependency chains in pruneMessages
- **fix(ai)**: Handle missing usage data in retry logic
- **fix(anthropic)**: Validate thinking block requirement and prevent silent reasoning drop
- **fix(anthropic)**: Keep tools array when toolChoice is 'none'
- **fix(openai)**: Handle stream errors in Responses API
- **fix(openai)**: Accept empty string type in streaming tool call deltas (Azure)
- **fix(provider-utils)**: RFC 9110 compliant User-Agent header format
- **fix(telemetry)**: Add missing usage attributes to generateText and generateObject
- Plus 19 more bug fixes across providers (Google, Bedrock, LangChain, React)

## [2.3.0] - 2025-07-17

### 📚 Documentation & Developer Experience

#### M16: API Simplification
- **`gauss()` one-liner**: Zero-config quickstart with env auto-detection
- **Smart defaults**: Auto-detects OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.
- **GaussError**: Enhanced errors with actionable suggestions

#### M17: Documentation Overhaul
- Complete rewrite of all documentation (15 files, 5000+ lines)
- Getting Started with zero-config examples
- Concepts guide covering 15 core concepts
- Cookbook with 21 practical recipes
- API Reference for all ports, adapters, providers
- Feature docs: Voice, Teams, Multimodal, Workflows
- Comparison matrix (57 features vs 3 competitors)
- Migration guides from Mastra, LangChain, Agno

#### M18: GitHub Pages
- Docusaurus site at giulio-leone.github.io/gauss
- Dark mode, search, responsive design
- GitHub Actions auto-deployment on push

#### M19: Examples Gallery
- 17 production-ready examples (8 new)
- Team coordination, voice pipeline, workflow DSL
- Multimodal vision, video processing, universal provider
- LLM recording/replay, zero-config one-liner

## [2.2.0] - 2025-07-16

### 🌐 Universal Provider & Video Processing

- **UniversalProvider**: Wraps any @ai-sdk/* package, 40+ providers via single API
- **Video Processing**: Frame extraction, video description, audio extraction
- Auto-discovery of installed AI SDK providers
- Case-insensitive factory name lookup

## [2.1.0] - 2025-07-16

### 🚀 Competitive Feature Pack — 6 New Capabilities

This release adds 6 features that bring Gauss to **96% competitive feature coverage** (55/57), surpassing Mastra (63%), DeepAgentsJS (21%), and Agno (54%).

#### Added

- **Team Coordination (M8)**: `team()` builder with 4 strategies — round-robin, broadcast, delegate, consensus. SharedContext for inter-agent state.
- **Voice STT/TTS (M9)**: OpenAI Whisper STT + TTS adapter, ElevenLabs premium TTS, `VoicePipeline` for STT→Agent→TTS orchestration.
- **Fluent Workflow DSL (M10)**: `workflow('id').then().branch().parallel().build()` — chainable API that compiles to existing `WorkflowEngine`. Zod I/O schema validation.
- **LLM Recording & Replay (M11)**: `LLMRecorder` intercepts all `generateText` calls (input, output, timing). `LLMReplayer` replays from JSONL for deterministic testing.
- **Visual Agent Builder (M12)**: Declarative JSON schema → executable agent graph. `VisualAgentBuilder` validates + compiles configs. `AgentBuilderAPI` for REST (create/list/get/run/delete). `ModelRegistry` for string→LanguageModel mapping.
- **Image Processing / Multimodal (M13)**: `MultimodalAgent` handles text + image inputs. `describeImage()`, `extractText()` (OCR), `compareImages()` shortcuts. URL, base64, and file image sources.

#### Clean API Surface

```ts
import { agent, graph, rag, team, workflow, multimodal } from 'gauss'
```

#### Test Coverage

- **1710 tests** (92 new: team 8, voice 9, workflow DSL 9, LLM recorder 13, visual builder 22, multimodal 9, API 8)

## [2.0.0] - 2025-07-15

### 🎉 Gauss — Complete Rebrand & Production Release

This is the first stable release under the **Gauss** brand. The framework has been completely
rebranded, API-redesigned, and extended with production adapters, provider wrappers, starter kits,
playground inspector tools, and comprehensive documentation.

### Added — API & Branding (M1)
- **Factory functions**: `agent()`, `graph()`, `rag()` for zero-boilerplate setup
- **Clean API surface**: `import { agent, tool, rag } from 'gauss'`
- **Automated rename** from DeepAgent/GaussFlow → Agent/Gauss across 114 files (878 replacements)
- **Organized barrel exports** in `src/index.ts` with logical sections

### Added — Provider Adapters (M2)
- **OpenAI** — `openai("gpt-4o")`
- **Anthropic** — `anthropic("claude-sonnet-4-20250514")`
- **Google Gemini** — `google("gemini-2.0-flash")`
- **Groq** — `groq("llama-3.3-70b-versatile")`
- **Ollama** — `ollama("llama3.2")` (local models, no API key)
- **OpenRouter** — `openrouter("anthropic/claude-sonnet-4-20250514")` (100+ models)
- Separate `gauss/providers` entry point — all AI SDK deps as optional peerDependencies

### Added — Production Persistence Adapters (M3)
- **PostgresStorageAdapter** — Multi-domain CRUD with JSONB
- **RedisStorageAdapter** — High-performance cache with TTL and pipelines
- **PgVectorStoreAdapter** — pgvector with HNSW index for semantic search
- **S3ObjectStorageAdapter** — Blob storage (S3, MinIO, Cloudflare R2)
- **BullMQQueueAdapter** — Background job processing with Redis
- New ports: `QueuePort`, `ObjectStoragePort`

### Added — DX & Starter Kits (M4)
- `gauss init --template <name>` — project scaffolding CLI
- 6 templates: chat, tools, rag, multi-agent, mcp, auth-rest
- Quickstart in README

### Added — Playground & Inspector (M5)
- Trace viewer — step-by-step execution timeline
- Token dashboard — usage tracking and cost estimation
- Tool call inspector — input/output visibility
- Reliability dashboard — circuit breaker, retry, rate limit metrics
- `PlaygroundCollector` — automatic data collection

### Added — Documentation (M6)
- Concept docs with architecture overview
- Hexagonal architecture deep dive
- 20 copy-paste cookbook recipes
- Migration guide from LangChain and Mastra
- Feature comparison matrix vs competitors
- Full API reference for providers and persistence

### Breaking Changes
- Package renamed from `@giulio-leone/gaussflow-agent` to `gauss`
- All `DeepAgent*` classes renamed to `Agent*`
- All `GaussFlow*` symbols renamed to `Gauss*`
- Storage key prefix changed from `deep-agent` to `gauss`
- Backward-compatibility aliases removed — clean API only

---

## Pre-Gauss History (Legacy)

## [1.3.0] - 2026-02-16

### Added

- **HierarchicalEventBus**: Child buses with namespace-scoped events, bubbling (child→parent), broadcasting (parent→children), anti-storm backpressure (maxBubblesPerSecond)
- **ReactiveSharedContext**: Key-level watchers with wildcard support, optimistic locking via `setVersioned()`, CRDT merge with CAS retry loop, scoped contexts with watcher bubbling
- **WorkerPool**: Generic async work-stealing pool with dynamic grow/shrink, priority queue, abort support, timeout detection, and bounded metrics (max 1000 entries)
- **AsyncChannel**: Push→pull bridge implementing `AsyncIterable<T>` for `for await...of` consumption
- **IncrementalReadyTracker**: Incremental Kahn's algorithm — O(fan-out) per `markCompleted()`, snapshot/restore support
- **PriorityQueue**: Generic binary min-heap with custom comparator
- **TokenBudgetController**: 3-tier budget management (ok/soft-limit/hard-limit) with acquire/release semantics and rolling auto-refined estimates
- **ReactiveGraphExecutor**: Event-driven push-based graph execution replacing batch-static GraphExecutor. Uses WorkerPool + IncrementalReadyTracker + AsyncChannel + TokenBudgetController
- **ForkCoordinator**: Parallel fork execution with partial results, `minResults` threshold, eager resolution on mixed success+error, and timeout support
- **SubagentRegistry**: 7-state lifecycle manager (queued→running→streaming→completed/failed/timeout/cancelled) with validated transitions, GC, orphan detection, cancellation cascade
- **SubagentScheduler**: Priority queue with aging anti-starvation, circuit breaker per task type, dynamic pool sizing, ToolLoopAgent execution
- **Async Subagent Tools**: `dispatch_subagent` (fire-and-forget), `poll_subagent` (status check), `await_subagent` (multi-task wait with timeout) — replaces synchronous TaskTool
- **AgentSupervisor**: Erlang-style supervision with one-for-one, one-for-all, rest-for-one strategies. Child policies (permanent/temporary/transient), restart intensity with sliding window, escalation, heartbeat monitoring, graceful degradation with fallback
- **SupervisorBuilder**: Fluent builder for AgentSupervisor configuration
- **DynamicAgentGraph**: Runtime graph mutations (addNode, removeNode, replaceNode, addEdge, removeEdge) with incremental cycle detection, duplicate edge rejection, append-only mutation log, event emission
- **Structured Planning System**: Hierarchical Zod schema (Plan→Phase→Step→SubStep), state machine with validated transitions, 4 tools (plan_create, plan_update, plan_status, plan_visualize), plan-to-graph conversion
- **New Event Types**: 9 supervisor/subagent/graph event types in AgentEventType union + `graph:mutation`
- **Full Public API Exports**: All new modules exported from `src/index.ts`

### Fixed

- AgentSupervisor: factory() failures no longer permanently brick child recovery (try/catch + status reset to "crashed")
- AgentSupervisor: unhandled promise rejections in heartbeat setInterval callbacks (`.catch()` guard)
- AgentSupervisor: restartAll/restartRestForOne continue loop on individual factory failures
- WorkerPool: latencies/completionTimestamps arrays capped at 1000 entries (prevents unbounded memory growth)
- DynamicAgentGraph: duplicate edges rejected (prevents IncrementalReadyTracker deadlock)
- SharedContext: TOCTOU race in setVersioned fixed with synchronous version bump before async write
- SharedContext: merge() now uses CAS retry loop (max 3 retries) instead of unsafe read-then-write
- ForkCoordinator: eagerly resolves when all nodes reported with enough successes (no unnecessary timeout wait)
- GraphExecutor: fork node promises awaited on success path (prevents orphaned LLM API calls)

### Breaking Changes

- `EventBus` now supports hierarchical features (createChild, bubbling, broadcasting) — API extended
- `SharedContext` now supports watchers, versioning, merge, scoping — API extended
- `GraphExecutor` replaced with reactive push-based implementation (same class name preserved)
- New `graph:mutation` event type added to AgentEventType union

## [1.2.0] - 2026-02-16

### Added

- **Structured Code Editing**: `editFile` tool with old_str→new_str pattern, diff preview, and confirmation gate
- **File Creation**: `createFile` tool that fails if file exists (clean separation from writeFile)
- **Unified Diff Generator**: LCS-based colored diff with context lines (red/green/dim/cyan)
- **Git Integration**: gitStatus, gitDiff, gitCommit, gitLog, gitBranch tools + `/git` slash command
- **Streaming Run Command**: Token-by-token output for `gaussflow "<prompt>"` (was batch)
- **Slash Commands**: `/test`, `/lint`, `/fix` for quick development workflow
- **Project Context Awareness**: Auto-detect project type, framework, language, and dependencies
- **`.gaussflowignore`**: Exclude files from search/list operations (gitignore-like format)
- **Diff Preview for writeFile**: Shows colored unified diff before confirming overwrites

### Security

- Index-based string splice in editFile (prevents `String.replace` dollar-sign injection)
- `spawnSync` for all git commands with user input (prevents shell injection)
- Staging state preservation on gitCommit cancel (restores pre-existing staged files)
- Segment-boundary matching in shouldIgnore (no false positive prefix matches)

### Changed

- System prompts now include project context (type, framework, key deps, structure)
- `listFiles` and `searchFiles` respect `.gaussflowignore` patterns
- `z.string().min(1)` on editFile's `old_str` (prevents empty-string infinite loop)
- MAX_DIFF_LINES=1000 guard against OOM on large file diffs

## [1.0.0] - 2026-02-16

### Added

- OpenTelemetry observability with port, adapters, and integration
- Cost/Token tracking with port, adapter, and CLI `usage` command
- Agent Test Harness with mock provider, test runner, assertions, and snapshots

### Changed

- Lazy-load CLI commands for 95% bundle reduction (178 KB → 9 KB)

### Fixed

- TypeScript build errors in execution-engine and mock-provider
- R1 review issues for otel-observability
- R1 and R2 review issues for cost-tracking

## [0.9.0] - 2026-02-16

### Added

- Tool Composition Pipeline (port, adapter, tests)
- Partial JSON Streaming (port, adapter, accumulator)
- Conditionals, loops, and filters in template engine

### Fixed

- R4–R9 review fixes for tool composition, template engine, and partial JSON
- R8 sentinel collision and keyword leak in prompt-template

## [0.8.1] - 2026-02-16

### Added

- SemanticScraping manifest API documentation

### Changed

- Low-priority performance and refactoring optimizations

## [0.8.0] - 2026-02-16

### Changed

- Remaining performance and refactoring optimizations batch
- Medium-impact performance optimizations batch

## [0.7.0] - 2026-02-16

### Changed

- Code optimization — performance, DRY, and SOLID improvements

## [0.6.0] - 2026-02-16

### Added

- Native MCP Server (port, adapter, plugin)
- Agent Memory & Context system
- Plugin Registry
- `name` property on RuntimePort and conditional runtime exports

## [0.5.0] - 2026-02-16

### Added

- Advanced RAG pipeline — chunking, re-ranking, hybrid search
- A2A Full protocol enhancements for Gauss
- WorkflowEngine with parallel, conditional, and loop steps
- `/scraping` sub-path export for browser/extension contexts
- Semantic scraping capabilities ported from mcp-inspector-openrouter
- Workflow and A2A sub-path exports

### Fixed

- 14 A2A review issues — security, memory, SSE, timeouts
- 2-arg `z.record()` for Zod v4 compatibility

## [0.4.0] - 2026-02-15

### Added

- MCP server support and streaming tool calls in CLI

### Changed

- Architecture optimization, CLI UX, and SRP improvements

### Fixed

- Pass `--yolo` to REPL, fix readline deadlock, serialize confirmations

## [0.3.0] - 2026-02-15

### Added

- Agentic CLI — tools, YOLO mode, bash, files, system prompt, markdown rendering
- Prompt templates, observability plugin, lifecycle hooks
- CLI upgrade — OpenRouter fix, `/settings`, `maskKey`, config safety

## [0.2.1] - 2026-02-15

### Changed

- Split Agent into ToolManager + ExecutionEngine (SRP)

## [0.2.0] - 2026-02-15

### Added

- Production patterns — circuit breaker, rate limiter, tool cache
- Enhanced REPL experience with spinner, history, timing
- OpenRouter provider, config defaults, direct prompt mode
- REST API server with integration tests
- OneAgent CLI with REPL, single-shot, config, and demo modes
- ObservabilityPlugin with TracingPort, MetricsPort, LoggingPort
- WorkflowPlugin with retry, rollback, and deep-clone isolation
- AgentGraph streaming and parallel execution
- Deno, Bun, and Edge runtime adapters
- RuntimePort + NodeRuntimeAdapter + auto-detection
- CI matrix and multi-runtime documentation
- EvalsPlugin with evaluation metrics collection
- VectorlessPlugin with RAG/knowledge tools
- OneCrawlPlugin with web scraping and search tools
- GuardrailsPlugin with input/output validation and content filtering
- LearningSystem with hexagonal architecture
- Built-in A2A and AgentCard plugins
- Plugin system core with lifecycle hooks
- Multi-agent collaboration (AgentGraph) + real-time streaming (SSE/WS)
- Multi-runtime support (Deno, Edge, Browser) + MCP server mode
- 230 passing tests and comprehensive documentation
- GitHub Packages publish workflow
- Docusaurus documentation site

### Changed

- Rename package to `gauss`
- Standardize naming to Gauss brand
- Extract AbstractBuilder template method pattern
- Add ValidationPort with ZodValidationAdapter
- Extract BasePlugin abstract class for DRY plugin pattern
- Extract BaseRuntimeAdapter (DRY)

### Fixed

- Code quality — domain errors, type safety, dead code removal
- Performance optimizations — memory bounds, lazy loading, backpressure
- Pin AI SDK providers to latest stable versions
- Downgrade Zod to ^3.25.76, remove nonexistent peer deps
- CI build failures and Bun test runner
- Move AI SDK providers to optionalDependencies
- Use `npm install` in CI (pnpm workspace breaks `npm ci`)
- Separate npm install and publish registries in workflow
- Add `package-lock.json` for CI reproducibility

## [0.1.0] - 2026-02-11

### Added

- Initial deep-agents framework built on AI SDK v6
- Hexagonal architecture with ports and adapters
- 73 passing tests with 18 review fixes
- README and 6 usage examples

### Fixed

- Correct `@ai-sdk/mcp` peer dependency version to ^1.0.0

[3.5.0]: https://github.com/giulio-leone/gauss/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/giulio-leone/gauss/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/giulio-leone/gauss/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/giulio-leone/gauss/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/giulio-leone/gauss/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/giulio-leone/gauss/compare/v2.4.0...v3.0.0
[1.0.0]: https://github.com/giulio-leone/gauss/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/giulio-leone/gauss/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/giulio-leone/gauss/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/giulio-leone/gauss/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/giulio-leone/gauss/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/giulio-leone/gauss/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/giulio-leone/gauss/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/giulio-leone/gauss/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/giulio-leone/gauss/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/giulio-leone/gauss/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/giulio-leone/gauss/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/giulio-leone/gauss/releases/tag/v0.1.0
