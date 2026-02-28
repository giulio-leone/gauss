import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";
import type { Todo } from "../../domain/todo.schema.js";
import { TODOS_PATH, loadTodos } from "./shared.js";

const TodoInputSchema = z.object({
  id: z.string().describe("Unique identifier (kebab-case)"),
  title: z.string().describe("Short title of the task"),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "done", "blocked"]).optional(),
  dependencies: z.array(z.string()).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export function createWriteTodosTool(fs: FilesystemPort) {
  return tool({
    description:
      "Create or update a task plan. Each todo has an id, title, " +
      "optional description, status, dependencies, and priority.",
    inputSchema: z.object({
      todos: z.array(TodoInputSchema).describe("Todos to create or update"),
    }),
    execute: async ({ todos }) => {
      const existing = await loadTodos(fs);
      const byId = new Map(existing.map((t) => [t.id, t]));
      let created = 0;
      let updated = 0;

      for (const input of todos) {
        const now = Date.now();
        const prev = byId.get(input.id);
        if (prev) {
          byId.set(input.id, { ...prev, ...input, updatedAt: now });
          updated++;
        } else {
          byId.set(input.id, {
            status: "pending",
            dependencies: [],
            priority: "medium",
            createdAt: now,
            updatedAt: now,
            ...input,
          } as Todo);
          created++;
        }
      }

      const all = Array.from(byId.values());
      await fs.write(TODOS_PATH, JSON.stringify(all, null, 2), "persistent");
      return `Plan updated: ${created} created, ${updated} updated, ${all.length} total.`;
    },
  });
}

