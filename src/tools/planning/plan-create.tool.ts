// =============================================================================
// plan:create — Tool per creare un piano strutturato gerarchico
// =============================================================================

import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import {
  PlanSchema,
  StepExecutionModeSchema,
  StepPrioritySchema,
  IOFieldSchema,
  validatePlan,
} from "../../domain/plan.schema.js";
import { savePlan } from "./plan-shared.js";

const StepInputSchema = z.object({
  id: z.string().describe("ID univoco dello step (kebab-case)"),
  title: z.string().describe("Titolo breve"),
  description: z.string().optional(),
  executionMode: StepExecutionModeSchema.optional(),
  priority: StepPrioritySchema.optional(),
  prompt: z.string().optional().describe("Istruzioni per l'agente"),
  dependencies: z.array(z.string()).optional(),
  requiredTools: z.array(z.string()).optional(),
  inputs: z.array(IOFieldSchema).optional().describe("Contratto input"),
  outputs: z.array(IOFieldSchema).optional().describe("Contratto output"),
  maxTokenBudget: z.number().optional(),
  timeoutMs: z.number().optional(),
  subSteps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    prompt: z.string().optional(),
  })).optional(),
});

const PhaseInputSchema = z.object({
  id: z.string().describe("ID univoco della fase (kebab-case)"),
  title: z.string().describe("Titolo della fase"),
  description: z.string().optional(),
  executionMode: StepExecutionModeSchema.optional(),
  dependencies: z.array(z.string()).optional(),
  steps: z.array(StepInputSchema).min(1),
});

export function createPlanCreateTool(fs: FilesystemPort) {
  return tool({
    description:
      "Crea un piano strutturato gerarchico con fasi, step e sotto-step. " +
      "Ogni step ha contratti input/output, priorità, risorse e dipendenze. " +
      "Supporta esecuzione sequenziale, parallela, condizionale e loop.",
    inputSchema: z.object({
      id: z.string().describe("ID univoco del piano (kebab-case)"),
      title: z.string().describe("Titolo del piano"),
      description: z.string().optional(),
      goal: z.string().describe("Obiettivo principale del piano"),
      tags: z.array(z.string()).optional(),
      constraints: z.array(z.string()).optional(),
      phases: z.array(PhaseInputSchema).min(1).describe("Fasi del piano"),
      maxTokenBudget: z.number().optional(),
      timeoutMs: z.number().optional(),
    }),
    execute: async (input) => {
      const now = Date.now();

      const phases = input.phases.map((p, idx) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        executionMode: p.executionMode ?? "sequential",
        status: "idle" as const,
        order: idx,
        dependencies: p.dependencies ?? [],
        steps: p.steps.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          executionMode: s.executionMode ?? "sequential",
          status: "idle" as const,
          priority: s.priority ?? "medium",
          contract: {
            inputs: s.inputs ?? [],
            outputs: s.outputs ?? [],
          },
          resources: (s.maxTokenBudget || s.timeoutMs)
            ? {
                maxTokenBudget: s.maxTokenBudget,
                timeoutMs: s.timeoutMs,
                maxRetries: 0,
                maxConcurrency: 5,
              }
            : undefined,
          dependencies: s.dependencies ?? [],
          prompt: s.prompt,
          requiredTools: s.requiredTools ?? [],
          subSteps: (s.subSteps ?? []).map((ss) => ({
            id: ss.id,
            title: ss.title,
            description: ss.description,
            prompt: ss.prompt,
            status: "idle" as const,
            executionMode: "sequential" as const,
            requiredTools: [],
          })),
          createdAt: now,
          updatedAt: now,
        })),
        createdAt: now,
        updatedAt: now,
      }));

      const plan = PlanSchema.parse({
        id: input.id,
        title: input.title,
        description: input.description,
        status: "draft",
        metadata: {
          goal: input.goal,
          createdBy: "agent",
          version: 1,
          tags: input.tags ?? [],
          constraints: input.constraints ?? [],
        },
        phases,
        globalResources: (input.maxTokenBudget || input.timeoutMs)
          ? {
              maxTokenBudget: input.maxTokenBudget,
              timeoutMs: input.timeoutMs,
              maxRetries: 0,
              maxConcurrency: 5,
            }
          : undefined,
        createdAt: now,
        updatedAt: now,
      });

      // Valida la struttura
      const validation = validatePlan(plan);
      if (!validation.valid) {
        return `Errore nella creazione del piano:\n${validation.errors.join("\n")}`;
      }

      await savePlan(fs, plan);

      const totalSteps = plan.phases.reduce((sum, p) => sum + p.steps.length, 0);
      const warnings = validation.warnings.length > 0
        ? `\nWarning: ${validation.warnings.join("; ")}`
        : "";

      return (
        `Piano "${plan.title}" creato con successo.\n` +
        `ID: ${plan.id}\n` +
        `Fasi: ${plan.phases.length}\n` +
        `Step totali: ${totalSteps}\n` +
        `Stato: ${plan.status}` +
        warnings
      );
    },
  });
}
