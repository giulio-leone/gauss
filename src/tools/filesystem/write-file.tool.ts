import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";

export function createWriteFileTool(fs: FilesystemPort) {
  return tool({
    description:
      "Create or overwrite a file with the given content. " +
      "Parent directories are created automatically.",
    inputSchema: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Content to write to the file"),
      zone: z
        .enum(["transient", "persistent"])
        .default("transient")
        .optional()
        .describe("Filesystem zone"),
    }),
    execute: async ({ path, content, zone }) => {
      await fs.write(path, content, zone ?? "transient");
      return `File written: ${path} (${content.length} bytes)`;
    },
  });
}
