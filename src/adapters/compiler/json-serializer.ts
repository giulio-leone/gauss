// =============================================================================
// JSON Serializer — Machine-readable CompilerOutput serialization
// =============================================================================

import type { CompilerOutput } from "../../domain/compiler.schema.js";
import type { SerializerPort, SerializerFormat } from "../../ports/serializer.port.js";

export class JSONSerializer implements SerializerPort {
  readonly format: SerializerFormat = "json";

  serialize(output: CompilerOutput): string {
    return JSON.stringify(output, null, 2);
  }
}
