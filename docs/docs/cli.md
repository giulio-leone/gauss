---
sidebar_position: 7
---

# CLI

OneAgent includes a command-line interface for interactive testing and scripting.

## Installation

```bash
# Global install
npm install -g @onegenui/agent
oneagent --help

# Or use npx
npx @onegenui/agent --help
```

## Commands

### Interactive Chat (REPL)

```bash
oneagent chat --provider openai --api-key sk-...
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
oneagent run "What is the capital of France?" --provider openai
```

Execute a single prompt and exit. Ideal for scripting and CI/CD pipelines.

### Config Management

```bash
# Save API key (stored in ~/.oneagentrc with 0600 permissions)
oneagent config set openai sk-...
oneagent config set anthropic sk-ant-...

# List saved keys (masked)
oneagent config list

# Delete a key
oneagent config delete openai
```

### Demo Modes

```bash
oneagent demo guardrails --provider openai    # Input/output validation
oneagent demo workflow --provider openai       # Step-based workflow execution
oneagent demo graph --provider openai          # Multi-agent graph collaboration
oneagent demo observability --provider openai  # Tracing, metrics, logging
```

## Providers

| Provider | Flag | Default Model | Env Variable |
|----------|------|---------------|--------------|
| OpenAI | `--provider openai` | `gpt-4o` | `OPENAI_API_KEY` |
| Anthropic | `--provider anthropic` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| Google | `--provider google` | `gemini-2.0-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Groq | `--provider groq` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| Mistral | `--provider mistral` | `mistral-large-latest` | `MISTRAL_API_KEY` |

API key resolution order: `--api-key` flag → `~/.oneagentrc` → environment variable.

## Override Model

```bash
oneagent chat --provider openai --model gpt-4o-mini
oneagent run "Hello" --provider anthropic --model claude-haiku-3-5-20241022
```
