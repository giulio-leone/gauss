import { describe, it, expect } from "vitest";
import {
  runCodemods,
  createRenameImportCodemod,
  createRenameSymbolCodemod,
  createReplaceCallCodemod,
  createAddImportCodemod,
} from "../codemod.js";
import type { Codemod } from "../codemod.js";

describe("Codemod Framework", () => {
  describe("runCodemods", () => {
    it("applies a single codemod", () => {
      const mod: Codemod = {
        id: "test",
        description: "Replace foo with bar",
        transform(content) {
          const r = content.replace(/foo/g, "bar");
          return r !== content ? r : null;
        },
      };
      const results = runCodemods([mod], [
        { path: "a.ts", content: "const x = foo;" },
        { path: "b.ts", content: "const x = baz;" },
      ]);
      expect(results[0].modified).toBe(true);
      expect(results[0].transformed).toBe("const x = bar;");
      expect(results[1].modified).toBe(false);
    });

    it("applies multiple codemods in order", () => {
      const mods: Codemod[] = [
        {
          id: "a",
          description: "a→b",
          transform(content) {
            const r = content.replace(/aaa/g, "bbb");
            return r !== content ? r : null;
          },
        },
        {
          id: "b",
          description: "b→c",
          transform(content) {
            const r = content.replace(/bbb/g, "ccc");
            return r !== content ? r : null;
          },
        },
      ];
      const results = runCodemods(mods, [{ path: "x.ts", content: "aaa" }]);
      expect(results[0].transformed).toBe("ccc");
      expect(results[0].original).toBe("aaa");
    });

    it("preserves original on no modification", () => {
      const mod: Codemod = {
        id: "noop",
        description: "noop",
        transform() { return null; },
      };
      const results = runCodemods([mod], [{ path: "x.ts", content: "hello" }]);
      expect(results[0].modified).toBe(false);
      expect(results[0].original).toBeUndefined();
    });
  });

  describe("createRenameImportCodemod", () => {
    it("renames package imports", () => {
      const mod = createRenameImportCodemod("rename-pkg", "old-pkg", "new-pkg");
      const content = `import { foo } from "old-pkg";\nimport { bar } from 'old-pkg';`;
      const result = mod.transform(content, "test.ts");
      expect(result).toContain(`from "new-pkg"`);
      expect(result).toContain(`from 'new-pkg'`);
    });

    it("returns null if no match", () => {
      const mod = createRenameImportCodemod("rename", "old", "new");
      expect(mod.transform("import { x } from 'other';", "test.ts")).toBeNull();
    });
  });

  describe("createRenameSymbolCodemod", () => {
    it("renames symbol occurrences", () => {
      const mod = createRenameSymbolCodemod("rename", "OldClass", "NewClass");
      const result = mod.transform("const x = new OldClass(); OldClass.method();", "test.ts");
      expect(result).toContain("NewClass");
      expect(result).not.toContain("OldClass");
    });
  });

  describe("createReplaceCallCodemod", () => {
    it("replaces function calls", () => {
      const mod = createReplaceCallCodemod("replace", "agent.run(", "agent.execute(");
      const result = mod.transform("const r = agent.run(prompt);", "test.ts");
      expect(result).toContain("agent.execute(");
    });
  });

  describe("createAddImportCodemod", () => {
    it("adds import if missing", () => {
      const mod = createAddImportCodemod("add", 'import { z } from "zod";');
      const result = mod.transform("const x = 1;", "test.ts");
      expect(result).toContain('import { z } from "zod";\nconst x = 1;');
    });

    it("skips if import already exists", () => {
      const mod = createAddImportCodemod("add", 'import { z } from "zod";');
      const result = mod.transform('import { z } from "zod";\nconst x = 1;', "test.ts");
      expect(result).toBeNull();
    });
  });
});
