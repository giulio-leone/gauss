// =============================================================================
// gauss init — Project scaffolding command
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { color, bold } from "./format.js";

const TEMPLATES = {
  chat: { name: "Chat Agent", description: "Minimal conversational AI with streaming" },
  tools: { name: "Tool Calling Agent", description: "Agent with custom tools (weather, calculator)" },
  rag: { name: "RAG Agent", description: "Retrieval-augmented generation with vector store" },
  "multi-agent": { name: "Multi-Agent Workflow", description: "Orchestrated agent collaboration via graph" },
  mcp: { name: "MCP Server/Client", description: "Model Context Protocol integration" },
  "auth-rest": { name: "Auth + REST API", description: "Production REST server with authentication" },
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export function handleInit(args: string[]): void {
  const templateArg = args.find((a) => a.startsWith("--template="))?.split("=")[1]
    ?? args[args.indexOf("--template") + 1]
    ?? args.find((a) => !a.startsWith("-"));

  if (args.includes("--list")) {
    listTemplates();
    return;
  }

  if (!templateArg || !(templateArg in TEMPLATES)) {
    console.log(`\n${bold("gauss init")} — Scaffold a new Gauss project\n`);
    console.log(`${bold("Usage:")} gauss init --template <name> [directory]\n`);
    listTemplates();
    console.log(`\n${bold("Example:")} gauss init --template chat my-agent\n`);
    return;
  }

  const template = templateArg as TemplateName;
  const dirArg = args.find((a) => !a.startsWith("-") && a !== templateArg) ?? `.`;
  const targetDir = join(process.cwd(), dirArg);

  scaffold(template, targetDir);
}

function listTemplates(): void {
  console.log(`${bold("Available templates:")}\n`);
  for (const [key, info] of Object.entries(TEMPLATES)) {
    console.log(`  ${color("cyan", key.padEnd(16))} ${info.description}`);
  }
}

function scaffold(template: TemplateName, targetDir: string): void {
  const info = TEMPLATES[template];

  // Create directory
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Resolve template source
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const templateSrc = join(__dirname, "templates", `${template}.ts`);

  let templateContent: string;
  if (existsSync(templateSrc)) {
    templateContent = readFileSync(templateSrc, "utf-8");
  } else {
    // Fallback: embed minimal template inline
    templateContent = getInlineTemplate(template);
  }

  // Write files
  const mainFile = join(targetDir, "index.ts");
  writeFileSync(mainFile, templateContent);

  // Write package.json
  const pkgPath = join(targetDir, "package.json");
  if (!existsSync(pkgPath)) {
    const pkg = {
      name: `gauss-${template}-agent`,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "npx tsx index.ts",
        start: "node --loader tsx index.ts",
      },
      dependencies: {
        gauss: "latest",
        ai: "^6.0.0",
        zod: "^3.23.0",
      },
    };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }

  // Write tsconfig.json
  const tsconfigPath = join(targetDir, "tsconfig.json");
  if (!existsSync(tsconfigPath)) {
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "dist",
      },
      include: ["*.ts"],
    };
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
  }

  // Write .env.example
  const envPath = join(targetDir, ".env.example");
  if (!existsSync(envPath)) {
    writeFileSync(envPath, "OPENAI_API_KEY=sk-...\n# ANTHROPIC_API_KEY=sk-ant-...\n# GOOGLE_GENERATIVE_AI_API_KEY=...\n");
  }

  console.log(`\n${bold("✨ Project scaffolded!")} Template: ${color("cyan", info.name)}\n`);
  console.log(`  ${color("dim", "Directory:")} ${targetDir}`);
  console.log(`  ${color("dim", "Files:")}     index.ts, package.json, tsconfig.json, .env.example\n`);
  console.log(`${bold("Next steps:")}`);
  if (targetDir !== process.cwd()) {
    console.log(`  cd ${dirArg !== "." ? dirArg : ""}`);
  }
  console.log(`  npm install`);
  console.log(`  # Set your API key in .env`);
  console.log(`  npm run dev\n`);
}

function getInlineTemplate(template: TemplateName): string {
  return `// Gauss ${TEMPLATES[template].name} template
import { agent } from "gauss";
import { openai } from "gauss/providers";

const myAgent = agent({
  model: openai("gpt-5.2-mini"),
  instructions: "You are a helpful assistant.",
}).build();

const result = await myAgent.run("Hello!");
console.log(result.text);
`;
}
