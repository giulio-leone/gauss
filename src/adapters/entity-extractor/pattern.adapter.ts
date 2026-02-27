// =============================================================================
// PatternEntityExtractor — Regex/pattern-based entity extraction (NER-lite)
// =============================================================================

import type { EntityExtractorPort, ExtractionResult, Entity, Relation } from "../../ports/entity-extractor.port.js";

export interface PatternRule {
  type: string;
  pattern: RegExp;
  /** Extract properties from match groups */
  extract?: (match: RegExpExecArray) => Record<string, unknown>;
}

export interface RelationPattern {
  /** Pattern that spans two entity references */
  pattern: RegExp;
  type: string;
  /** Map group indices to source (1-based) and target (1-based) entity names */
  sourceGroup: number;
  targetGroup: number;
  confidence?: number;
}

export interface PatternEntityExtractorConfig {
  entityPatterns: PatternRule[];
  relationPatterns?: RelationPattern[];
}

/** Default patterns for common entities */
export const DEFAULT_ENTITY_PATTERNS: PatternRule[] = [
  { type: "PERSON", pattern: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g },
  { type: "EMAIL", pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g },
  { type: "URL", pattern: /\bhttps?:\/\/[^\s<>\"]+/g },
  { type: "DATE", pattern: /\b(\d{4}-\d{2}-\d{2})\b/g },
  { type: "NUMBER", pattern: /\b(\d+(?:\.\d+)?)\b/g },
];

export class PatternEntityExtractorAdapter implements EntityExtractorPort {
  private config: PatternEntityExtractorConfig;

  constructor(config?: Partial<PatternEntityExtractorConfig>) {
    this.config = {
      entityPatterns: config?.entityPatterns ?? DEFAULT_ENTITY_PATTERNS,
      relationPatterns: config?.relationPatterns ?? [],
    };
  }

  async extract(text: string): Promise<ExtractionResult> {
    const entities: Entity[] = [];
    const seen = new Set<string>();

    for (const rule of this.config.entityPatterns) {
      // Reset lastIndex for global patterns
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1] ?? match[0];
        const key = `${rule.type}::${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entities.push({
          name,
          type: rule.type,
          properties: rule.extract ? rule.extract(match) : {},
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    const relations: Relation[] = [];
    for (const rp of this.config.relationPatterns ?? []) {
      const pattern = new RegExp(rp.pattern.source, rp.pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const source = match[rp.sourceGroup];
        const target = match[rp.targetGroup];
        if (source && target) {
          relations.push({
            source,
            target,
            type: rp.type,
            confidence: rp.confidence ?? 0.8,
          });
        }
      }
    }

    return { entities, relations };
  }
}
