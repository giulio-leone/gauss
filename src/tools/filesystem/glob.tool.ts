import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";

export function createGlobTool(fs: FilesystemPort) {
  return tool({
    description:
      "Find files matching a glob pattern (e.g. '**/*.ts'). " +
      "Returns a list of matching file paths.",
    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern to match files"),
      zone: z
        .enum(["transient", "persistent"])
        .default("transient")
        .optional()
        .describe("Filesystem zone"),
    }),
    execute: async ({ pattern, zone }) => {
      const matches = await fs.glob(pattern, zone ?? "transient");
      if (matches.length === 0) return "No files matched the pattern.";
      return matches.join("\n");
    },
  });
}
