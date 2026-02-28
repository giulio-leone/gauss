// =============================================================================
// Plan-to-Graph — Conversione automatica Plan → AgentGraph
//
// Ogni Phase diventa un gruppo di nodi, ogni Step diventa un AgentNode.
// Le fasi parallele diventano fork nel grafo.
// Le dipendenze tra step diventano edge.
// =============================================================================

import type { LanguageModel } from "../../core/llm/index.js";
import type { Plan, Phase, Step } from "../../domain/plan.schema.js";
import type { AgentConfig } from "../../types.js";
import { AgentGraph } from "../../graph/agent-graph.js";

export interface PlanToGraphOptions {
  /** Modello AI di default per tutti i nodi */
  defaultModel: LanguageModel;
  /** System instructions di base per tutti gli agenti */
  baseInstructions?: string;
  /** Tool aggiuntivi da iniettare in tutti i nodi */
  globalTools?: Record<string, unknown>;
  /** Mappa di override per modello specifico per step (stepId → model) */
  modelOverrides?: Record<string, LanguageModel>;
}

/**
 * Converte un Plan gerarchico in un AgentGraph eseguibile dal GraphExecutor.
 *
 * Strategia di mapping:
 * - Ogni Step → AgentNode con prompt e config derivati dal piano
 * - Dipendenze esplicite tra step → edge nel grafo
 * - Dipendenze implicite tra fasi → edge dal ultimo step della fase A al primo della fase B
 * - Fasi parallele → fork nel grafo (step eseguiti in parallelo)
 * - SubStep vengono inclusi nelle istruzioni del nodo padre (prompt arricchito)
 */
export function planToGraph(plan: Plan, options: PlanToGraphOptions): AgentGraph {
  const builder = AgentGraph.create({
    maxConcurrency: plan.globalResources?.maxConcurrency ?? 5,
    timeoutMs: plan.globalResources?.timeoutMs ?? 600_000,
    maxTokenBudget: plan.globalResources?.maxTokenBudget ?? 1_000_000,
  });

  // Ordina le fasi per campo `order`
  const sortedPhases = [...plan.phases].sort((a, b) => a.order - b.order);

  // Traccia ultimo step di ogni fase per dipendenze implicite
  const lastStepByPhase = new Map<string, string>();

  for (const phase of sortedPhases) {
    registerPhase(builder, phase, plan, options, sortedPhases, lastStepByPhase);
  }

  return builder.build();
}

function registerPhase(
  builder: ReturnType<typeof AgentGraph.create>,
  phase: Phase,
  plan: Plan,
  options: PlanToGraphOptions,
  allPhases: Phase[],
  lastStepByPhase: Map<string, string>,
): void {
  if (phase.executionMode === "parallel" && phase.steps.length >= 2) {
    // Fase parallela → fork
    const configs = phase.steps.map((step) =>
      buildAgentConfig(step, plan, options),
    );

    builder.fork(phase.id, configs);

    // Edge da fasi dipendenti
    for (const depPhaseId of phase.dependencies) {
      const lastStep = lastStepByPhase.get(depPhaseId);
      if (lastStep) {
        builder.edge(lastStep, phase.id);
      }
    }

    lastStepByPhase.set(phase.id, phase.id);
  } else {
    // Fase sequenziale → nodi collegati in serie
    for (const step of phase.steps) {
      const config = buildAgentConfig(step, plan, options);
      builder.node(step.id, config);

      // Edge dalle dipendenze esplicite dello step
      for (const dep of step.dependencies) {
        builder.edge(dep, step.id);
      }

      // Edge dalle fasi dipendenti (solo per il primo step della fase)
      if (step === phase.steps[0]) {
        for (const depPhaseId of phase.dependencies) {
          const lastStep = lastStepByPhase.get(depPhaseId);
          if (lastStep) {
            builder.edge(lastStep, step.id);
          }
        }
      }
    }

    // Collega step sequenziali interni (se non hanno già dipendenze esplicite)
    for (let i = 1; i < phase.steps.length; i++) {
      const prev = phase.steps[i - 1]!;
      const curr = phase.steps[i]!;
      if (!curr.dependencies.includes(prev.id)) {
        builder.edge(prev.id, curr.id);
      }
    }

    const lastStep = phase.steps[phase.steps.length - 1];
    if (lastStep) {
      lastStepByPhase.set(phase.id, lastStep.id);
    }
  }
}

function buildAgentConfig(
  step: Step,
  plan: Plan,
  options: PlanToGraphOptions,
): AgentConfig {
  const model =
    options.modelOverrides?.[step.id] ??
    (step.resources?.preferredModel
      ? options.defaultModel // In produzione: resolve model by name
      : options.defaultModel);

  const instructions = buildStepInstructions(step, plan, options);

  return {
    id: step.id,
    name: step.title,
    instructions,
    model,
    maxSteps: 20,
    context: {
      summarizationThreshold: 0.7,
      truncationThreshold: 0.85,
    },
  };
}

function buildStepInstructions(
  step: Step,
  plan: Plan,
  options: PlanToGraphOptions,
): string {
  const sections: string[] = [];

  // Base instructions
  if (options.baseInstructions) {
    sections.push(options.baseInstructions);
  }

  // Contesto del piano
  sections.push(
    `## Contesto Piano\n` +
    `Piano: ${plan.title}\n` +
    `Obiettivo: ${plan.metadata.goal}`,
  );

  // Step prompt
  if (step.prompt) {
    sections.push(`## Task\n${step.prompt}`);
  }

  if (step.description) {
    sections.push(`## Descrizione\n${step.description}`);
  }

  // Contratto I/O
  if (step.contract.inputs.length > 0) {
    const inputDesc = step.contract.inputs
      .map((i) => `- ${i.name} (${i.type}${i.required ? ", obbligatorio" : ""}): ${i.description ?? ""}`)
      .join("\n");
    sections.push(`## Input Attesi\n${inputDesc}`);
  }

  if (step.contract.outputs.length > 0) {
    const outputDesc = step.contract.outputs
      .map((o) => `- ${o.name} (${o.type}${o.required ? ", obbligatorio" : ""}): ${o.description ?? ""}`)
      .join("\n");
    sections.push(
      `## Output Richiesti\nProduci i seguenti output:\n${outputDesc}`,
    );
  }

  // SubStep come checklist
  if (step.subSteps.length > 0) {
    const subStepList = formatSubSteps(step.subSteps, 0);
    sections.push(`## Sotto-task\nSegui questi sotto-task in ordine:\n${subStepList}`);
  }

  // Risorse/limiti
  if (step.resources) {
    const limits: string[] = [];
    if (step.resources.maxTokenBudget) {
      limits.push(`Token budget: ${step.resources.maxTokenBudget}`);
    }
    if (step.resources.timeoutMs) {
      limits.push(`Timeout: ${step.resources.timeoutMs}ms`);
    }
    if (limits.length > 0) {
      sections.push(`## Limiti\n${limits.join("\n")}`);
    }
  }

  return sections.join("\n\n");
}

function formatSubSteps(
  subSteps: Array<{ id: string; title: string; prompt?: string; children?: unknown[] }>,
  indent: number,
): string {
  const prefix = "  ".repeat(indent);
  return subSteps
    .map((ss, i) => {
      let line = `${prefix}${i + 1}. [${ss.id}] ${ss.title}`;
      if (ss.prompt) line += `\n${prefix}   → ${ss.prompt}`;
      if (ss.children && Array.isArray(ss.children) && ss.children.length > 0) {
        line += "\n" + formatSubSteps(
          ss.children as Array<{ id: string; title: string; prompt?: string; children?: unknown[] }>,
          indent + 1,
        );
      }
      return line;
    })
    .join("\n");
}
