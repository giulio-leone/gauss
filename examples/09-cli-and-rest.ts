// =============================================================================
// Example 09 — GaussFlow REST API Server
// =============================================================================
// Start a REST API server to expose GaussFlow over HTTP.
// Any language (Python, Go, Ruby) can use GaussFlow via HTTP requests.

import { GaussFlowServer } from "@giulio-leone/gaussflow-agent";

const server = new GaussFlowServer({
  port: 3456,
  cors: true,
  // apiKey: "my-secret-token",  // Uncomment for Bearer auth
});

await server.listen();
console.log("GaussFlow REST API running on http://localhost:3456");
console.log("Try: curl http://localhost:3456/api/health");
console.log('Try: curl -X POST http://localhost:3456/api/run -H "Content-Type: application/json" -d \'{"prompt":"Hello!","provider":"openai","apiKey":"sk-..."}\'');
