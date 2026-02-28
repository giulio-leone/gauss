// =============================================================================
// plan:status — Stato corrente con progress tree
// =============================================================================

import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import { calculateProgress, type Plan, type StepProgress, type PhaseProgress } from "../../domain/plan.schema.js";
import { loadPlan } from "./plan-shared.js";

export function createPlanStatusTool(fs: FilesystemPort) {
  return tool({
    description:
      "Mostra lo stato corrente del piano con progress tree. " +
      "Visualizza avanzamento per fase, step e sotto-step.",
    inputSchema: z.object({
      verbose: z
        .boolean()
        .optional()
        .default(false)
        .describe("Se true, mostra anche i sotto-step"),
    }),
    execute: async ({ verbose }) => {
      const plan = await loadPlan(fs);
      if (!plan) return "Nessun piano trovato. Usa plan_create prima.";

      const progress = calculateProgress(plan);

      return formatProgressTree(progress, plan, verbose);
    },
  });
}

function formatProgressTree(
  progress: ReturnType<typeof calculateProgress>,
  plan: Plan,
  verbose: boolean,
): string {
  const lines: string[] = [];
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // Header
  lines.push(
    `📋 ${progress.title} [${progress.status}] — ${pct(progress.progress)} completato`,
  );
  lines.push(
    `   Step: ${progress.completedSteps}/${progress.totalSteps} completati` +
    (progress.failedSteps > 0 ? `, ${progress.failedSteps} falliti` : ""),
  );
  if (progress.elapsedMs) {
    lines.push(`   Tempo: ${Math.round(progress.elapsedMs / 1000)}s`);
  }
  if (progress.tokenUsage) {
    lines.push(
      `   Token: ${progress.tokenUsage.input + progress.tokenUsage.output} totali`,
    );
  }
  lines.push(`   Versione: v${plan.metadata.version}`);
  lines.push("");

  // Fasi
  for (const phase of progress.phases) {
    const phaseIcon = statusIcon(phase.status);
    lines.push(
      `${phaseIcon} Fase: ${phase.title} [${phase.status}] — ${pct(phase.progress)}`,
    );

    for (const step of phase.steps) {
      const stepIcon = statusIcon(step.status);
      const subInfo =
        step.subStepsTotal > 0
          ? ` (${step.subStepsDone}/${step.subStepsTotal} sotto-step)`
          : "";
      lines.push(
        `  ${stepIcon} ${step.stepId}: ${step.title} [${step.status}]${subInfo}`,
      );

      // SubStep (verbose only)
      if (verbose) {
        const planPhase = plan.phases.find(
          (p) => p.steps.some((s) => s.id === step.stepId),
        );
        const planStep = planPhase?.steps.find((s) => s.id === step.stepId);
        if (planStep?.subSteps.length) {
          for (const ss of planStep.subSteps) {
            const ssIcon = statusIcon(ss.status);
            lines.push(`    ${ssIcon} ${ss.id}: ${ss.title} [${ss.status}]`);
          }
        }

        // Mostra dipendenze
        if (planStep?.dependencies.length) {
          lines.push(`    ↳ dipende da: ${planStep.dependencies.join(", ")}`);
        }

        // Mostra contratto
        if (planStep?.contract.outputs.length) {
          const outs = planStep.contract.outputs.map((o) => o.name).join(", ");
          lines.push(`    ↳ produce: ${outs}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function statusIcon(status: string): string {
  const icons: Record<string, string> = {
    idle: "⚪",
    pending: "🔵",
    running: "🔄",
    completed: "✅",
    failed: "❌",
    skipped: "⏭️",
    blocked: "🚫",
    cancelled: "🔴",
  };
  return icons[status] ?? "❓";
}
