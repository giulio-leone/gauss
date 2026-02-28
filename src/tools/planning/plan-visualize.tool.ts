// =============================================================================
// plan:visualize — Output ASCII o Mermaid del piano
// =============================================================================

import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import type { Plan, Phase, Step } from "../../domain/plan.schema.js";
import { loadPlan } from "./plan-shared.js";

export function createPlanVisualizeTool(fs: FilesystemPort) {
  return tool({
    description:
      "Visualizza il piano come diagramma ASCII o Mermaid. " +
      "Mostra la gerarchia fasi/step e le dipendenze.",
    inputSchema: z.object({
      format: z
        .enum(["ascii", "mermaid"])
        .default("ascii")
        .describe("Formato di output"),
    }),
    execute: async ({ format }) => {
      const plan = await loadPlan(fs);
      if (!plan) return "Nessun piano trovato. Usa plan_create prima.";

      return format === "mermaid"
        ? renderMermaid(plan)
        : renderAscii(plan);
    },
  });
}

// =============================================================================
// Mermaid Renderer
// =============================================================================

function renderMermaid(plan: Plan): string {
  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("graph TD");
  lines.push(`  subgraph ${sanitize(plan.title)}`);

  for (const phase of plan.phases) {
    const phaseLabel = `phase_${phase.id}`;
    lines.push(`    subgraph ${phaseLabel}["${phase.title} (${phase.executionMode})"]`);

    for (const step of phase.steps) {
      const shape = stepShape(step);
      lines.push(`      ${step.id}${shape}`);
    }

    // Edge interni alla fase
    if (phase.executionMode === "sequential") {
      for (let i = 1; i < phase.steps.length; i++) {
        const prev = phase.steps[i - 1]!;
        const curr = phase.steps[i]!;
        if (!curr.dependencies.includes(prev.id)) {
          lines.push(`      ${prev.id} --> ${curr.id}`);
        }
      }
    }

    lines.push("    end");
  }

  // Edge esplicite tra step (dipendenze cross-fase)
  for (const phase of plan.phases) {
    for (const step of phase.steps) {
      for (const dep of step.dependencies) {
        lines.push(`  ${dep} --> ${step.id}`);
      }
    }
  }

  // Edge tra fasi
  for (const phase of plan.phases) {
    for (const depPhaseId of phase.dependencies) {
      const depPhase = plan.phases.find((p) => p.id === depPhaseId);
      if (depPhase) {
        const lastStep = depPhase.steps[depPhase.steps.length - 1];
        const firstStep = phase.steps[0];
        if (lastStep && firstStep) {
          lines.push(`  ${lastStep.id} ==> ${firstStep.id}`);
        }
      }
    }
  }

  lines.push("  end");
  lines.push("```");

  // Stili per stato
  lines.push("");
  lines.push("Legenda:");
  lines.push("  [step] = sequenziale");
  lines.push("  {step} = condizionale");
  lines.push("  ((step)) = loop");
  lines.push("  ==> = dipendenza tra fasi");

  return lines.join("\n");
}

function stepShape(step: Step): string {
  const label = `${step.title}`;
  switch (step.executionMode) {
    case "conditional":
      return `{${label}}`;
    case "loop":
      return `((${label}))`;
    case "parallel":
      return `[/${label}/]`;
    default:
      return `["${label}"]`;
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\- àèéìòù]/g, "_");
}

// =============================================================================
// ASCII Renderer
// =============================================================================

function renderAscii(plan: Plan): string {
  const lines: string[] = [];
  const W = 72;

  lines.push("╔" + "═".repeat(W) + "╗");
  lines.push(
    "║" + centerPad(`📋 ${plan.title}`, W) + "║",
  );
  lines.push(
    "║" + centerPad(`Stato: ${plan.status} | v${plan.metadata.version}`, W) + "║",
  );
  lines.push("╠" + "═".repeat(W) + "╣");

  for (let pi = 0; pi < plan.phases.length; pi++) {
    const phase = plan.phases[pi]!;
    const modeLabel = phase.executionMode === "parallel" ? "⚡ PARALLEL" : "→ SEQ";

    lines.push(
      "║" +
        leftPad(
          `  Fase ${pi + 1}: ${phase.title} [${modeLabel}]`,
          W,
        ) +
        "║",
    );
    lines.push("║" + " ".repeat(2) + "─".repeat(W - 2) + "║");

    for (const step of phase.steps) {
      const icon = statusIconAscii(step.status);
      const depStr =
        step.dependencies.length > 0
          ? ` ← [${step.dependencies.join(", ")}]`
          : "";
      const modeBadge = step.executionMode !== "sequential"
        ? ` (${step.executionMode})`
        : "";

      lines.push(
        "║" +
          leftPad(
            `    ${icon} ${step.id}: ${step.title}${modeBadge}${depStr}`,
            W,
          ) +
          "║",
      );

      // SubStep
      for (const ss of step.subSteps) {
        const ssIcon = statusIconAscii(ss.status);
        lines.push(
          "║" +
            leftPad(`      ${ssIcon} └─ ${ss.id}: ${ss.title}`, W) +
            "║",
        );
      }

      // Contratto output
      if (step.contract.outputs.length > 0) {
        const outs = step.contract.outputs.map((o) => o.name).join(", ");
        lines.push(
          "║" + leftPad(`         ↳ output: ${outs}`, W) + "║",
        );
      }
    }

    if (pi < plan.phases.length - 1) {
      lines.push("║" + " ".repeat(W) + "║");

      // Connessione tra fasi
      const nextPhase = plan.phases[pi + 1]!;
      if (nextPhase.dependencies.includes(phase.id)) {
        lines.push("║" + centerPad("│", W) + "║");
        lines.push("║" + centerPad("▼", W) + "║");
      } else {
        lines.push("║" + centerPad("┊", W) + "║");
      }
      lines.push("║" + " ".repeat(W) + "║");
    }
  }

  lines.push("╚" + "═".repeat(W) + "╝");
  return lines.join("\n");
}

function statusIconAscii(status: string): string {
  const icons: Record<string, string> = {
    idle: "○",
    pending: "◉",
    running: "►",
    completed: "✓",
    failed: "✗",
    skipped: "⊘",
    blocked: "⊗",
    cancelled: "⊖",
  };
  return icons[status] ?? "?";
}

function centerPad(text: string, width: number): string {
  // Account for multi-byte characters in emoji
  const visLen = [...text].length;
  if (visLen >= width) return text.slice(0, width);
  const left = Math.floor((width - visLen) / 2);
  const right = width - visLen - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

function leftPad(text: string, width: number): string {
  const visLen = [...text].length;
  if (visLen >= width) return text.slice(0, width);
  return text + " ".repeat(width - visLen);
}
