// =============================================================================
// CompileFromNL Service — Full pipeline: NL → parse → compile → output
// Orchestrates NLParserPort and WorkflowCompilerPort.
// =============================================================================

import type { NLParserPort, WorkflowCompilerPort, CompileFromNLPort } from "../../ports/compiler.port.js";
import { validateDeclaration, type CompilerOutput } from "../../domain/compiler.schema.js";

export class CompileFromNLService implements CompileFromNLPort {
  constructor(
    private readonly parser: NLParserPort,
    private readonly compiler: WorkflowCompilerPort,
  ) {}

  async compileFromNL(naturalLanguage: string): Promise<CompilerOutput> {
    const declaration = await this.parser.parse(naturalLanguage);

    const validation = validateDeclaration(declaration);
    if (!validation.valid) {
      throw new Error(
        `NL Parser produced invalid declaration: ${validation.errors.join("; ")}`,
      );
    }

    return this.compiler.compile(validation.data);
  }
}
