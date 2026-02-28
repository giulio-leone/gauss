// =============================================================================
// plan:update — Tool per modificare step del piano a runtime
// =============================================================================

import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import {
  StepStatusSchema,
  StepPrioritySchema,
  StepExecutionModeSchema,
  IOFieldSchema,
  isValidStepTransition,
  validatePlan,
  type Plan,
  type Step,
  type Phase,
} from "../../domain/plan.schema.js";
import { loadPlan, savePlan } from "./plan-shared.js";

export function createPlanUpdateTool(fs: FilesystemPort) {
  return tool({
    description:
      "Modifica un piano esistente a runtime: aggiorna stato, aggiungi/rimuovi step, " +
      "modifica prompt, priorità, dipendenze. Supporta transizioni di stato validate.",
    inputSchema: z.object({
      action: z.enum([
        "update_step",
        "add_step",
        "remove_step",
        "update_phase",
        "add_phase",
        "update_plan_status",
        "set_result",
      ]).describe("Tipo di modifica"),

      // Per update_step / add_step / remove_step
      phaseId: z.string().optional().describe("ID della fase target"),
      stepId: z.string().optional().describe("ID dello step target"),

      // Campi aggiornabili
      status: StepStatusSchema.optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      prompt: z.string().optional(),
      priority: StepPrioritySchema.optional(),
      executionMode: StepExecutionModeSchema.optional(),
      dependencies: z.array(z.string()).optional(),
      requiredTools: z.array(z.string()).optional(),
      inputs: z.array(IOFieldSchema).optional(),
      outputs: z.array(IOFieldSchema).optional(),

      // Per set_result
      resultOutput: z.string().optional(),
      resultData: z.record(z.string(), z.unknown()).optional(),

      // Per add_phase
      phaseTitle: z.string().optional(),
      phaseOrder: z.number().optional(),

      // Per update_plan_status
      planStatus: z.enum(["draft", "active", "paused", "completed", "failed", "cancelled"]).optional(),
    }),
    execute: async (input) => {
      const plan = await loadPlan(fs);
      if (!plan) return "Nessun piano trovato. Usa plan_create prima.";

      const now = Date.now();

      switch (input.action) {
        case "update_step": {
          if (!input.stepId) return "stepId richiesto per update_step";
          const { phase, step } = findStep(plan, input.stepId);
          if (!step) return `Step "${input.stepId}" non trovato`;

          // Validazione transizione di stato
          if (input.status && input.status !== step.status) {
            if (!isValidStepTransition(step.status, input.status)) {
              return (
                `Transizione non valida: "${step.status}" → "${input.status}" ` +
                `per step "${step.id}"`
              );
            }
            step.status = input.status;
            if (input.status === "running") step.startedAt = now;
            if (input.status === "completed" || input.status === "failed") {
              step.completedAt = now;
            }
          }

          if (input.title) step.title = input.title;
          if (input.description) step.description = input.description;
          if (input.prompt) step.prompt = input.prompt;
          if (input.priority) step.priority = input.priority;
          if (input.executionMode) step.executionMode = input.executionMode;
          if (input.dependencies) step.dependencies = input.dependencies;
          if (input.requiredTools) step.requiredTools = input.requiredTools;
          if (input.inputs) step.contract.inputs = input.inputs;
          if (input.outputs) step.contract.outputs = input.outputs;
          step.updatedAt = now;

          plan.updatedAt = now;
          plan.metadata.version++;
          await savePlan(fs, plan);
          return `Step "${step.id}" aggiornato (v${plan.metadata.version}).`;
        }

        case "add_step": {
          if (!input.phaseId) return "phaseId richiesto per add_step";
          if (!input.stepId || !input.title) return "stepId e title richiesti per add_step";

          const phase = plan.phases.find((p) => p.id === input.phaseId);
          if (!phase) return `Fase "${input.phaseId}" non trovata`;

          const newStep: Step = {
            id: input.stepId,
            title: input.title,
            description: input.description,
            executionMode: input.executionMode ?? "sequential",
            status: "idle",
            priority: input.priority ?? "medium",
            contract: {
              inputs: input.inputs ?? [],
              outputs: input.outputs ?? [],
            },
            dependencies: input.dependencies ?? [],
            prompt: input.prompt,
            requiredTools: input.requiredTools ?? [],
            subSteps: [],
            createdAt: now,
            updatedAt: now,
          };

          phase.steps.push(newStep);
          phase.updatedAt = now;
          plan.updatedAt = now;
          plan.metadata.version++;

          const validation = validatePlan(plan);
          if (!validation.valid) {
            phase.steps.pop();
            return `Errore: lo step creerebbe problemi:\n${validation.errors.join("\n")}`;
          }

          await savePlan(fs, plan);
          return `Step "${input.stepId}" aggiunto alla fase "${input.phaseId}" (v${plan.metadata.version}).`;
        }

        case "remove_step": {
          if (!input.stepId) return "stepId richiesto per remove_step";
          const { phase } = findStep(plan, input.stepId);
          if (!phase) return `Step "${input.stepId}" non trovato`;

          phase.steps = phase.steps.filter((s) => s.id !== input.stepId);
          phase.updatedAt = now;
          plan.updatedAt = now;
          plan.metadata.version++;
          await savePlan(fs, plan);
          return `Step "${input.stepId}" rimosso (v${plan.metadata.version}).`;
        }

        case "update_phase": {
          if (!input.phaseId) return "phaseId richiesto per update_phase";
          const phase = plan.phases.find((p) => p.id === input.phaseId);
          if (!phase) return `Fase "${input.phaseId}" non trovata`;

          if (input.title) phase.title = input.title;
          if (input.description) phase.description = input.description;
          if (input.executionMode) phase.executionMode = input.executionMode;
          if (input.dependencies) phase.dependencies = input.dependencies;
          phase.updatedAt = now;
          plan.updatedAt = now;
          plan.metadata.version++;
          await savePlan(fs, plan);
          return `Fase "${phase.id}" aggiornata (v${plan.metadata.version}).`;
        }

        case "add_phase": {
          if (!input.phaseId || !input.phaseTitle) {
            return "phaseId e phaseTitle richiesti per add_phase";
          }

          const newPhase: Phase = {
            id: input.phaseId,
            title: input.phaseTitle,
            description: input.description,
            executionMode: input.executionMode ?? "sequential",
            status: "idle",
            steps: [],
            order: input.phaseOrder ?? plan.phases.length,
            dependencies: input.dependencies ?? [],
            createdAt: now,
            updatedAt: now,
          };

          plan.phases.push(newPhase);
          plan.updatedAt = now;
          plan.metadata.version++;
          await savePlan(fs, plan);
          return `Fase "${input.phaseId}" aggiunta (v${plan.metadata.version}). Aggiungi step con add_step.`;
        }

        case "update_plan_status": {
          if (!input.planStatus) return "planStatus richiesto";
          plan.status = input.planStatus;
          if (input.planStatus === "active" && !plan.startedAt) {
            plan.startedAt = now;
          }
          if (input.planStatus === "completed" || input.planStatus === "failed") {
            plan.completedAt = now;
          }
          plan.updatedAt = now;
          plan.metadata.version++;
          await savePlan(fs, plan);
          return `Piano aggiornato a stato "${input.planStatus}" (v${plan.metadata.version}).`;
        }

        case "set_result": {
          if (!input.stepId) return "stepId richiesto per set_result";
          const { step } = findStep(plan, input.stepId);
          if (!step) return `Step "${input.stepId}" non trovato`;

          step.result = {
            output: input.resultOutput,
            data: input.resultData,
          };
          step.updatedAt = now;
          plan.updatedAt = now;
          await savePlan(fs, plan);
          return `Risultato salvato per step "${input.stepId}".`;
        }

        default:
          return `Azione "${input.action}" non supportata.`;
      }
    },
  });
}

function findStep(
  plan: Plan,
  stepId: string,
): { phase?: Phase; step?: Step } {
  for (const phase of plan.phases) {
    const step = phase.steps.find((s) => s.id === stepId);
    if (step) return { phase, step };
  }
  return {};
}
