import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import type { Todo, TodoStatus } from "../../domain/todo.schema.js";
import { TODOS_PATH, loadTodos } from "./shared.js";

export function createReviewTodosTool(fs: FilesystemPort) {
  return tool({
    description:
      "Review current task plan and optionally update todo statuses. " +
      "Returns the full plan with progress.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            id: z.string().describe("Todo ID to update"),
            status: z.enum(["pending", "in_progress", "done", "blocked"]),
          }),
        )
        .optional()
        .describe("Optional status updates to apply"),
    }),
    execute: async ({ updates }) => {
      const todos = await loadTodos(fs);
      if (todos.length === 0) return "No todos found. Use write_todos first.";

      if (updates?.length) {
        const byId = new Map(todos.map((t) => [t.id, t]));
        for (const u of updates) {
          const t = byId.get(u.id);
          if (!t) continue;
          t.status = u.status as TodoStatus;
          t.updatedAt = Date.now();
          if (u.status === "done") t.completedAt = Date.now();
        }
        await fs.write(
          TODOS_PATH,
          JSON.stringify(todos, null, 2),
          "persistent",
        );
      }

      return formatPlan(todos);
    },
  });
}

function formatPlan(todos: Todo[]): string {
  const counts = { pending: 0, in_progress: 0, done: 0, blocked: 0 };
  for (const t of todos) counts[t.status as keyof typeof counts]++;

  const header =
    `Plan: ${todos.length} total | ` +
    `${counts.done} done, ${counts.in_progress} in-progress, ` +
    `${counts.pending} pending, ${counts.blocked} blocked`;

  const lines = todos.map(
    (t) =>
      `[${t.status}] ${t.id}: ${t.title}` +
      (t.dependencies?.length ? ` (deps: ${t.dependencies.join(", ")})` : ""),
  );
  return [header, "---", ...lines].join("\n");
}

