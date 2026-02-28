---
sidebar_position: 7
title: CLI Reference
---

# CLI Reference

The `gauss` CLI provides commands for scaffolding, developing, building, and deploying Gauss projects.

## Installation

```bash
npm install -g gauss
# or
npx gauss
```

## Commands

### `gauss init`

Scaffold a new Gauss project with interactive prompts.

```bash
gauss init [directory]
```

**Interactive Prompts:**
- Project name (default: current directory)
- Template selection
- Package manager (npm, yarn, pnpm, bun)

**Templates:**
- `minimal` — Basic agent setup
- `full` — Complete project with tools, workflows, and voice
- `rag` — Retrieval-augmented generation (RAG) example
- `mcp` — Model Context Protocol (MCP) integration
- `team` — Multi-agent team collaboration
- `workflow` — Complex workflow orchestration

**Examples:**

```bash
# Interactive setup
gauss init my-project

# Scaffold with template
gauss init my-project --template rag --package-manager pnpm

# Use current directory
gauss init --template team
```

### `gauss dev`

Start the development server with hot reload support.

```bash
gauss dev
```

**Options:**
- `--port <port>` — Custom port (default: 3000)
- `--host <host>` — Bind to specific host (default: localhost)
- `--open` — Automatically open browser

**Examples:**

```bash
# Start on default port
gauss dev

# Custom port
gauss dev --port 8000

# Open in browser
gauss dev --open

# Custom host and port
gauss dev --host 0.0.0.0 --port 8080
```

**Features:**
- Fast Refresh for instant updates
- TypeScript support out of the box
- Real-time error reporting
- Auto-reload on file changes

### `gauss build`

Build your project for production.

```bash
gauss build
```

**Options:**
- `--outdir <dir>` — Output directory (default: dist/)
- `--minify` — Minify output (default: true)
- `--sourcemap` — Generate source maps (default: false)

**Examples:**

```bash
# Standard build
gauss build

# With source maps for debugging
gauss build --sourcemap

# Custom output directory
gauss build --outdir ./build
```

**Output:**
- Optimized agent code
- Bundled dependencies
- Production-ready deployables
- Type declarations

### `gauss deploy`

Deploy your Gauss project to cloud platforms.

```bash
gauss deploy [platform]
```

**Supported Platforms:**
- `vercel` — Vercel / Netlify
- `railway` — Railway
- `fly` — Fly.io
- `heroku` — Heroku
- `aws` — AWS Lambda / ECS
- `gcp` — Google Cloud Run
- `azure` — Azure Container Apps

**Examples:**

```bash
# Interactive platform selection
gauss deploy

# Deploy to Vercel
gauss deploy vercel

# Deploy to Railway
gauss deploy railway

# Deploy to AWS with custom region
gauss deploy aws --region us-west-2
```

**Pre-deployment:**
- Validates configuration
- Checks environment variables
- Runs build
- Performs health checks

## Environment Variables

Create a `.env.local` file in your project root:

```bash
# API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...

# Database
DATABASE_URL=postgresql://user:password@localhost/gauss

# Redis (for memory/caching)
REDIS_URL=redis://localhost:6379

# Deployment
VERCEL_TOKEN=...
RAILWAY_TOKEN=...
```

## Global Options

All commands support:
- `--help` or `-h` — Show help
- `--version` or `-v` — Show version
- `--verbose` — Enable verbose logging
- `--no-color` — Disable colored output

**Examples:**

```bash
gauss init --help
gauss dev --verbose
gauss build --version
```

## Project Structure

After `gauss init`, your project follows this structure:

```
my-project/
├── src/
│   ├── agents/          # Agent definitions
│   ├── tools/           # Tool implementations
│   ├── workflows/       # Workflow definitions
│   └── index.ts         # Entry point
├── docs/                # Documentation
├── tests/               # Test files
├── gauss.config.ts      # Gauss configuration
├── package.json
└── tsconfig.json
```

## Configuration

The `gauss.config.ts` file controls behavior:

```typescript
import { defineConfig } from 'gauss';

export default defineConfig({
  agents: {
    defaultModel: 'gpt-4-turbo',
    timeout: 30000
  },
  voice: {
    provider: 'elevenlabs'
  },
  memory: {
    backend: 'redis'
  },
  deploy: {
    platform: 'vercel'
  }
});
```

## Troubleshooting

**Port already in use:**
```bash
gauss dev --port 3001
```

**Clear cache:**
```bash
rm -rf .gauss/
gauss dev
```

**View detailed errors:**
```bash
gauss dev --verbose
```

## Getting Help

- [Documentation](/docs)
- [Examples](/docs/cookbook)
- [GitHub Issues](https://github.com/gaussai/gauss/issues)
- [Community Discord](https://discord.gg/gauss)

