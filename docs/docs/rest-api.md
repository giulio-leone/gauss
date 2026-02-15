---
sidebar_position: 8
---

# REST API

GaussFlow includes a zero-dependency HTTP REST API server, enabling any language (Python, Go, Ruby, etc.) to use GaussFlow over HTTP.

## Quick Start

```typescript
import { GaussFlowServer } from "@giulio-leone/gaussflow-agent";

const server = new GaussFlowServer({
  port: 3456,
  apiKey: "my-secret-token", // Optional Bearer auth
  cors: true,
});

await server.listen();
```

## Endpoints

### `GET /api/health`

Health check (always public, no auth required).

```bash
curl http://localhost:3456/api/health
```

```json
{ "status": "ok", "version": "0.1.0" }
```

### `GET /api/info`

Server info including capabilities.

```bash
curl -H "Authorization: Bearer my-secret-token" http://localhost:3456/api/info
```

### `POST /api/run`

Run an agent with a prompt. Returns the complete response.

```bash
curl -X POST http://localhost:3456/api/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-secret-token" \
  -d '{
    "prompt": "What is AI?",
    "provider": "openai",
    "apiKey": "sk-...",
    "model": "gpt-4o",
    "instructions": "Be concise"
  }'
```

Response:

```json
{
  "text": "AI is...",
  "sessionId": "abc-123",
  "steps": 3,
  "duration": 1234
}
```

### `POST /api/stream`

Run an agent with Server-Sent Events (SSE) streaming.

```bash
curl -X POST http://localhost:3456/api/stream \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Tell me a story", "provider": "openai", "apiKey": "sk-..." }'
```

```
data: {"type":"token","content":"Once"}
data: {"type":"token","content":" upon"}
data: {"type":"done","text":"Once upon...","sessionId":"abc-123"}
```

### `POST /api/graph/run`

Run an AgentGraph with multiple nodes.

## Authentication

If `apiKey` is set in `ServerOptions`, all requests (except `/api/health`) must include:

```
Authorization: Bearer <token>
```

## Client Examples

### Python

```python
import requests

resp = requests.post("http://localhost:3456/api/run", json={
    "prompt": "What is AI?",
    "provider": "openai",
    "apiKey": "sk-..."
})
print(resp.json()["text"])
```

### Go

```go
body := `{"prompt":"What is AI?","provider":"openai","apiKey":"sk-..."}`
resp, _ := http.Post("http://localhost:3456/api/run", "application/json", strings.NewReader(body))
```

### cURL

```bash
curl -X POST http://localhost:3456/api/run \
  -H "Content-Type: application/json" \
  -d '{"prompt":"What is AI?","provider":"openai","apiKey":"sk-..."}'
```

## Server Options

```typescript
interface ServerOptions {
  port?: number;           // default: 3456
  apiKey?: string;         // Bearer token for auth
  defaultProvider?: string; // default: "openai"
  defaultModel?: string;   // default: "gpt-4o"
  cors?: boolean;          // default: true
}
```
