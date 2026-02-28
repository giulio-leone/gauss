// =============================================================================
// CoverageTracker — Track tool usage and branch coverage
// =============================================================================

import type {
  CoverageTracker,
  CoverageReport,
  ToolCoverageEntry,
} from "../../ports/agent-testing.port.js";

interface MutableToolEntry {
  toolName: string;
  callCount: number;
  argPatterns: Set<string>;
  errorCount: number;
  totalDurationMs: number;
}

export class DefaultCoverageTracker implements CoverageTracker {
  private registeredTools: Set<string> = new Set();
  private toolEntries: Map<string, MutableToolEntry> = new Map();
  private totalSteps = 0;
  private totalToolCalls = 0;

  registerTools(toolNames: readonly string[]): void {
    for (const name of toolNames) {
      this.registeredTools.add(name);
    }
  }

  recordToolCall(
    toolName: string,
    args: unknown,
    durationMs: number,
    error?: Error,
  ): void {
    this.totalToolCalls++;

    let entry = this.toolEntries.get(toolName);
    if (!entry) {
      entry = {
        toolName,
        callCount: 0,
        argPatterns: new Set(),
        errorCount: 0,
        totalDurationMs: 0,
      };
      this.toolEntries.set(toolName, entry);
    }

    entry.callCount++;
    entry.totalDurationMs += durationMs;

    // Hash the arg shape for unique pattern tracking
    const argPattern = this.hashArgShape(args);
    entry.argPatterns.add(argPattern);

    if (error) {
      entry.errorCount++;
    }
  }

  /** Increment total step count (call once per agent step) */
  recordStep(): void {
    this.totalSteps++;
  }

  report(): CoverageReport {
    const calledTools = [...this.toolEntries.keys()];
    const registeredArr = [...this.registeredTools];
    const uncalledTools = registeredArr.filter(
      (t) => !this.toolEntries.has(t),
    );

    const allKnown = new Set([...this.registeredTools, ...calledTools]);
    const coveragePercent =
      allKnown.size === 0
        ? 100
        : (calledTools.length / allKnown.size) * 100;

    const toolDetails: Record<string, ToolCoverageEntry> = {};
    for (const [name, entry] of this.toolEntries) {
      toolDetails[name] = {
        toolName: entry.toolName,
        callCount: entry.callCount,
        uniqueArgPatterns: entry.argPatterns.size,
        errorCount: entry.errorCount,
        totalDurationMs: entry.totalDurationMs,
      };
    }

    return {
      registeredTools: registeredArr,
      calledTools,
      uncalledTools,
      coveragePercent: Math.round(coveragePercent * 100) / 100,
      toolDetails,
      totalSteps: this.totalSteps,
      totalToolCalls: this.totalToolCalls,
    };
  }

  reset(): void {
    this.toolEntries.clear();
    this.registeredTools.clear();
    this.totalSteps = 0;
    this.totalToolCalls = 0;
  }

  private hashArgShape(args: unknown): string {
    if (args === null || args === undefined) return "null";
    if (typeof args !== "object") return typeof args;

    // Create a shape signature based on sorted keys and value types
    const obj = args as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const shape = keys.map((k) => `${k}:${typeof obj[k]}`).join(",");
    return shape || "empty";
  }
}
