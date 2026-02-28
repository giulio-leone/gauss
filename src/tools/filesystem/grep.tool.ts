import { tool } from "../../core/llm/index.js";
import { z } from "zod";

import type { FilesystemPort } from "../../ports/filesystem.port.js";

export function createGrepTool(fs: FilesystemPort) {
  return tool({
    description:
      "Search file contents for a regex or string pattern. " +
      "Returns matching lines with file paths and line numbers.",
    inputSchema: z.object({
      pattern: z.string().describe("Regex or string pattern to search for"),
      path: z
        .string()
        .optional()
        .describe("Directory or file to search in"),
      caseSensitive: z.boolean().optional().default(true),
      maxResults: z
        .number()
        .int()
        .optional()
        .default(50)
        .describe("Maximum number of results to return"),
      zone: z
        .enum(["transient", "persistent"])
        .default("transient")
        .optional()
        .describe("Filesystem zone"),
    }),
    execute: async ({ pattern, path, caseSensitive, maxResults, zone }) => {
      const results = await fs.search(
        pattern,
        { caseSensitive, maxResults, includeLineNumbers: true, filePattern: path },
        zone ?? "transient",
      );
      if (results.length === 0) return "No matches found.";
      const lines = results.map(
        (r) => `${r.filePath}:${r.lineNumber}: ${r.lineContent}`,
      );
      return lines.join("\n");
    },
  });
}
