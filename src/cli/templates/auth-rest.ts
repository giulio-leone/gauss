// =============================================================================
// Template: Auth + REST API — Production REST server with authentication
// =============================================================================
// gauss init --template auth-rest
//
// Full REST API with JWT auth, rate limiting, and agent endpoints.
// =============================================================================

import { agent } from "gauss";
import { openai } from "gauss/providers";
import { tool } from "ai";
import { z } from "zod";

// ─── Agent Setup ─────────────────────────────────────────────────────────────

const apiAgent = agent({
  model: openai("gpt-5.2-mini"),
  instructions: `You are an API assistant. Help users with their requests.
Be concise and return structured JSON when appropriate.`,
  tools: {
    getUserProfile: tool({
      description: "Get user profile by ID",
      parameters: z.object({ userId: z.string() }),
      execute: async ({ userId }) => ({
        id: userId,
        name: "John Doe",
        email: "john@example.com",
        plan: "pro",
      }),
    }),
  },
}).build();

// ─── REST Server ─────────────────────────────────────────────────────────────

// Option 1: Use built-in REST server
// import { GaussRestServer } from 'gauss/rest'
//
// const server = new GaussRestServer({
//   agent: apiAgent,
//   port: 3000,
//   auth: {
//     type: 'bearer',
//     validate: async (token) => {
//       // Validate JWT or API key
//       return token === process.env.API_KEY
//     },
//   },
//   rateLimit: {
//     windowMs: 60_000,
//     maxRequests: 100,
//   },
// })
// await server.start()

// Option 2: Use with any HTTP framework (Express, Hono, etc.)
// import express from 'express'
// const app = express()
// app.post('/api/chat', async (req, res) => {
//   const { message, sessionId } = req.body
//   const result = await apiAgent.run(message, { sessionId })
//   res.json({ text: result.text })
// })
// app.listen(3000)

// Example: Run directly
const result = await apiAgent.run("Get the profile for user-123");
console.log(result.text);
