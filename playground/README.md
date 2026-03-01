# Gauss Playground

A standalone Vite + React 19 development UI for interacting with Gauss agents and exploring SDK features.

## Quick Start

```bash
cd playground
npm install
npm run dev
```

The playground starts at **http://localhost:4000** and proxies API requests to the Gauss server running on port 3000.

## Prerequisites

- Node.js 18+
- Gauss server running on `http://localhost:3000`

## Architecture

```
playground/
├── index.html               # Vite entry
├── vite.config.ts            # Vite config with API/WS proxy
├── src/
│   ├── main.tsx              # React 19 root
│   ├── App.tsx               # Main layout with sidebar + panels
│   ├── types.ts              # Shared TypeScript types
│   ├── data/
│   │   └── features.ts       # Feature catalog, categories & quick start snippets
│   ├── components/
│   │   ├── Header.tsx        # App header with version, feature count & connection status
│   │   ├── AgentList.tsx     # Agent sidebar with search/filter
│   │   ├── ChatPanel.tsx     # Chat with markdown & code blocks
│   │   ├── ToolInspector.tsx # Tool schema viewer with syntax highlighting
│   │   ├── ExecutionTimeline.tsx  # Visual timeline with colored nodes
│   │   ├── MemoryViewer.tsx  # Agent memory/context viewer
│   │   ├── MetricsPanel.tsx  # Token count, latency, cost tracking
│   │   ├── FeatureExplorer.tsx   # Feature grid with filtering & code examples
│   │   ├── FeatureSidebar.tsx    # Categorized feature navigation
│   │   └── QuickStart.tsx        # Code snippet showcase with tabbed examples
│   ├── hooks/
│   │   ├── useAgent.ts       # SSE streaming hook
│   │   ├── useWebSocket.ts   # WebSocket with auto-reconnect
│   │   └── useMetrics.ts     # Execution metrics derivation
│   └── styles/
│       └── index.css         # Dark theme, responsive layout
```

## Features

- **Feature Explorer** — Browse all 16 SDK features with descriptions, code examples, and category filters
- **Quick Start** — Tabbed code snippets for common operations (agents, teams, MCP, tools, graphs)
- **Feature Sidebar** — Categorized navigation: Core, Orchestration, Protocols, Infrastructure
- **Agent List** — Search and filter available agents
- **Chat Panel** — Send messages with streaming responses, inline code block rendering
- **Tool Inspector** — Browse tool schemas with JSON syntax highlighting
- **Execution Timeline** — Visual timeline with color-coded step nodes
- **Memory Viewer** — Inspect conversation context and memory usage
- **Metrics Panel** — Track token usage, latency, and estimated cost
- **Connection Status** — Real-time WebSocket connection indicator
- **Responsive** — Works on tablet and mobile layouts

## Development

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Start dev server on :4000 |
| `npm run build`   | Production build to `dist/` |
| `npm run preview` | Preview production build  |

## Proxy Configuration

The Vite dev server proxies:

- `/api/*` → `http://localhost:3000` (REST API)
- `/ws` → `ws://localhost:3000` (WebSocket)

This means the playground works seamlessly with the Gauss server during development without CORS issues.
