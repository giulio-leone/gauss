import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";

export function createEditFileTool(fs: FilesystemPort) {
  return tool({
    description:
      "Perform a surgical string replacement in a file. " +
      "Replaces the first occurrence of oldStr with newStr. " +
      "Fails if oldStr is not found.",
    inputSchema: z.object({
      path: z.string().describe("File path to edit"),
      oldStr: z.string().describe("Exact string to find and replace"),
      newStr: z.string().describe("Replacement string"),
      zone: z
        .enum(["transient", "persistent"])
        .default("transient")
        .optional()
        .describe("Filesystem zone"),
    }),
    execute: async ({ path, oldStr, newStr, zone }) => {
      const z2 = zone ?? "transient";
      const content = await fs.read(path, z2);
      if (!content.includes(oldStr)) {
        throw new Error(`oldStr not found in ${path}`);
      }
      const updated = content.replace(oldStr, newStr);
      await fs.write(path, updated, z2);
      return `File edited: ${path}`;
    },
  });
}
