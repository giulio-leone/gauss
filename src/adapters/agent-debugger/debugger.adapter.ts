// =============================================================================
// InMemoryAgentDebuggerAdapter — In-memory implementation of AgentDebuggerPort
// =============================================================================

import type {
  AgentDebuggerPort,
  DebugSession,
  DebugSessionSummary,
} from "../../ports/agent-debugger.port.js";
import { DebugSessionImpl } from "./debug-session.js";

let sessionCounter = 0;

export class InMemoryAgentDebuggerAdapter implements AgentDebuggerPort {
  private readonly sessions = new Map<string, DebugSessionImpl>();

  startSession(agentId: string, prompt: string): DebugSession {
    const id = `debug-${++sessionCounter}-${Date.now()}`;
    const session = new DebugSessionImpl(id, agentId, prompt);
    this.sessions.set(id, session);
    return session;
  }

  listSessions(): DebugSessionSummary[] {
    const summaries: DebugSessionSummary[] = [];
    for (const session of this.sessions.values()) {
      const cps = session.checkpoints;
      const lastState = cps.length > 0 ? cps[cps.length - 1].state : null;
      const firstTs = cps.length > 0 ? cps[0].timestamp : Date.now();
      const lastTs = cps.length > 0 ? cps[cps.length - 1].timestamp : firstTs;

      summaries.push({
        id: session.id,
        agentId: session.agentId,
        prompt: session.prompt,
        checkpointCount: cps.length,
        totalTokens: lastState?.tokenCount ?? 0,
        totalCost: lastState?.costEstimate ?? 0,
        durationMs: lastTs - firstTs,
        createdAt: firstTs,
      });
    }
    return summaries;
  }

  loadSession(sessionId: string): DebugSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debug session "${sessionId}" not found`);
    }
    return session;
  }

  /** Internal: get the implementation for the middleware */
  getSessionImpl(sessionId: string): DebugSessionImpl | undefined {
    return this.sessions.get(sessionId);
  }
}
