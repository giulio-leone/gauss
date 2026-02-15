---
sidebar_position: 7
---

# CLI

GaussFlow includes a command-line interface for interactive testing and scripting — similar to Claude Code or OpenCode.

## Installation

```bash
# Global install
npm install -g @giulio-leone/gaussflow-agent
gaussflow --help

# Or use npx
npx @giulio-leone/gaussflow-agent --help
```

## Quick Start — Direct Prompt

The fastest way to use GaussFlow. Just pass a prompt directly:

```bash
gaussflow "What is AI?"
```

This streams the response in real-time, just like Claude Code. No subcommand needed.

## Commands

### Direct Prompt (Default)

```bash
gaussflow "Explain quantum computing in simple terms"
gaussflow "Write a haiku about coding"
```

If the first argument isn't a known command, it's treated as a prompt and streamed directly.

### Interactive Chat (REPL)

```bash
gaussflow chat --provider openai --api-key sk-...
```

Start an interactive session with streaming responses. REPL commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/exit` | Exit the REPL |
| `/clear` | Clear the screen |
| `/model <id>` | Switch model (e.g., `/model gpt-4o-mini`) |
| `/provider <name>` | Switch provider |
| `/info` | Show current provider and model |

### Single-Shot Run

```bash
gaussflow run "What is the capital of France?" --provider openai
```

Execute a single prompt and exit. Ideal for scripting and CI/CD pipelines.

### Config Management

```bash
# Save API key (stored in ~/.gaussflowrc with 0600 permissions)
gaussflow config set openai sk-...
gaussflow config set anthropic sk-ant-...
gaussflow config set openrouter sk-or-...

# Set default provider and model
gaussflow config set-provider openai
gaussflow config set-model gpt-4o-mini

# Show full config (keys masked + defaults)
gaussflow config show

# List saved keys (masked)
gaussflow config list

# Delete a key
gaussflow config delete openai
```

### Demo Modes

```bash
gaussflow demo guardrails --provider openai    # Input/output validation
gaussflow demo workflow --provider openai       # Step-based workflow execution
gaussflow demo graph --provider openai          # Multi-agent graph collaboration
gaussflow demo observability --provider openai  # Tracing, metrics, logging
```

## Providers

| Provider | Flag | Default Model | Env Variable |
|----------|------|---------------|--------------|
| OpenAI | `--provider openai` | `gpt-4o` | `OPENAI_API_KEY` |
| Anthropic | `--provider anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| Google | `--provider google` | `gemini-2.0-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Groq | `--provider groq` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| Mistral | `--provider mistral` | `mistral-large-latest` | `MISTRAL_API_KEY` |
| OpenRouter | `--provider openrouter` | `openai/gpt-4o` | `OPENROUTER_API_KEY` |

API key resolution order: `--api-key` flag → `~/.gaussflowrc` → environment variable.

:::tip OpenRouter
OpenRouter gives you access to hundreds of models through a single API key. Model names use the `org/model` format (e.g., `anthropic/claude-sonnet-4-20250514`, `google/gemini-2.0-flash`).
:::

## Override Model

```bash
gaussflow chat --provider openai --model gpt-4o-mini
gaussflow run "Hello" --provider anthropic --model claude-haiku-3-5-20241022
gaussflow "Hello" --provider openrouter --model anthropic/claude-sonnet-4-20250514
```

## Config Defaults

Save your preferred provider and model to skip flags:

```bash
# One-time setup
gaussflow config set openai sk-...
gaussflow config set-provider openai
gaussflow config set-model gpt-4o-mini

# Now just use directly
gaussflow "What is AI?"
gaussflow chat
```

:::note
The saved default model is only used when the active provider matches the saved default provider. If you override `--provider`, the provider's own default model is used unless you also pass `--model`.
:::
