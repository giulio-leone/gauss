// =============================================================================
// Serializer Port — Contract for CompilerOutput serialization
// =============================================================================

import type { CompilerOutput } from "../domain/compiler.schema.js";

export type SerializerFormat = "json" | "markdown";

export interface SerializerPort {
  readonly format: SerializerFormat;
  serialize(output: CompilerOutput): string;
}
