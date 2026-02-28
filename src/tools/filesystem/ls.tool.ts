import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";

const zoneSchema = z
  .enum(["transient", "persistent"])
  .default("transient")
  .describe("Filesystem zone to operate in");

export function createLsTool(fs: FilesystemPort) {
  return tool({
    description:
      "List files and directories at the given path. " +
      "Returns names, sizes, and types. Use recursive to walk subdirectories.",
    inputSchema: z.object({
      path: z.string().describe("Directory path to list"),
      recursive: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to list subdirectories recursively"),
      zone: zoneSchema.optional(),
    }),
    execute: async ({ path, recursive, zone }) => {
      const entries = await fs.list(
        path,
        { recursive },
        zone ?? "transient",
      );
      if (entries.length === 0) return "Directory is empty.";
      const lines = entries.map((e) => {
        const tag = e.isDirectory ? "[dir] " : "      ";
        return `${tag}${e.path}  (${e.size} bytes)`;
      });
      return lines.join("\n");
    },
  });
}
