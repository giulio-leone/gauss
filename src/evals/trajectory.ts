// =============================================================================
// Agent Trajectory Evals — Custom Vitest matchers + trajectory capture
// =============================================================================

export interface TrajectoryStep {
  type: "agent_start" | "tool_call" | "tool_result" | "agent_response" | "error";
  name?: string;
  input?: unknown;
  output?: unknown;
  timestamp: number;
  duration?: number;
}

export interface Trajectory {
  agentName: string;
  steps: TrajectoryStep[];
  startedAt: number;
  completedAt?: number;
}

// --- Trajectory Recorder ---

export class TrajectoryRecorder {
  private steps: TrajectoryStep[] = [];
  private agentName: string;
  private startedAt: number;

  constructor(agentName: string) {
    this.agentName = agentName;
    this.startedAt = Date.now();
  }

  record(step: Omit<TrajectoryStep, "timestamp">): void {
    this.steps.push({ ...step, timestamp: Date.now() });
  }

  complete(): Trajectory {
    return {
      agentName: this.agentName,
      steps: structuredClone(this.steps),
      startedAt: this.startedAt,
      completedAt: Date.now(),
    };
  }

  snapshot(): Trajectory {
    return {
      agentName: this.agentName,
      steps: structuredClone(this.steps),
      startedAt: this.startedAt,
    };
  }
}

// --- Trajectory Assertions (framework-agnostic) ---

export function hasAgentSteps(trajectory: Trajectory, minSteps: number): boolean {
  return trajectory.steps.length >= minSteps;
}

export function hasToolCallRequests(trajectory: Trajectory, toolNames: string[]): boolean {
  const toolCalls = trajectory.steps.filter(s => s.type === "tool_call");
  return toolNames.every(name => toolCalls.some(s => s.name === name));
}

export function hasNoErrors(trajectory: Trajectory): boolean {
  return !trajectory.steps.some(s => s.type === "error");
}

export function hasToolCallCount(trajectory: Trajectory, name: string, count: number): boolean {
  return trajectory.steps.filter(s => s.type === "tool_call" && s.name === name).length === count;
}

export function completedWithin(trajectory: Trajectory, maxMs: number): boolean {
  if (!trajectory.completedAt) return false;
  return (trajectory.completedAt - trajectory.startedAt) <= maxMs;
}

export function hasOrderedSteps(trajectory: Trajectory, types: TrajectoryStep["type"][]): boolean {
  let idx = 0;
  for (const step of trajectory.steps) {
    if (idx < types.length && step.type === types[idx]) idx++;
  }
  return idx === types.length;
}

// --- Export format ---

export function exportTrajectory(trajectory: Trajectory): string {
  return JSON.stringify(trajectory, null, 2);
}

export function importTrajectory(json: string): Trajectory {
  return JSON.parse(json) as Trajectory;
}
