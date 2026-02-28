import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";

const MAX_CHARS = 50_000;

export function createReadFileTool(fs: FilesystemPort) {
  return tool({
    description:
      "Read the contents of a file and return it as a string. " +
      "Very large files are truncated to 50000 characters.",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
      zone: z
        .enum(["transient", "persistent"])
        .default("transient")
        .optional()
        .describe("Filesystem zone"),
    }),
    execute: async ({ path, zone }) => {
      const content = await fs.read(path, zone ?? "transient");
      if (content.length <= MAX_CHARS) return content;
      return (
        content.slice(0, MAX_CHARS) +
        `\n\n[Truncated: showing ${MAX_CHARS} of ${content.length} characters]`
      );
    },
  });
}
