// =============================================================================
// Example 09 — OneAgent REST API Server
// =============================================================================
// Start a REST API server to expose OneAgent over HTTP.
// Any language (Python, Go, Ruby) can use OneAgent via HTTP requests.

import { OneAgentServer } from "@onegenui/agent";

const server = new OneAgentServer({
  port: 3456,
  cors: true,
  // apiKey: "my-secret-token",  // Uncomment for Bearer auth
});

await server.listen();
console.log("OneAgent REST API running on http://localhost:3456");
console.log("Try: curl http://localhost:3456/api/health");
console.log('Try: curl -X POST http://localhost:3456/api/run -H "Content-Type: application/json" -d \'{"prompt":"Hello!","provider":"openai","apiKey":"sk-..."}\'');
