# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- A2A Full protocol enhancements for GaussFlow
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

- Split DeepAgent into ToolManager + ExecutionEngine (SRP)

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

- Rename package to `@giulio-leone/gaussflow-agent`
- Standardize naming to GaussFlow brand
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

[1.0.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/giulio-leone/onegenui-deep-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/giulio-leone/onegenui-deep-agents/releases/tag/v0.1.0
