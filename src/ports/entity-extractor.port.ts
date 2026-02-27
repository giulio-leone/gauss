// =============================================================================
// EntityExtractorPort — Extract entities and relations from text
// =============================================================================

export interface Entity {
  name: string;
  type: string;
  properties: Record<string, unknown>;
  /** Start offset in source text */
  start?: number;
  /** End offset in source text */
  end?: number;
}

export interface Relation {
  source: string;
  target: string;
  type: string;
  confidence: number;
}

export interface ExtractionResult {
  entities: Entity[];
  relations: Relation[];
}

export interface EntityExtractorPort {
  extract(text: string): Promise<ExtractionResult>;
}
