const PARTIAL_RE = /\{\{>(\w+)\}\}/g;
const VARIABLE_RE = /\{\{(\w+)\}\}/g;
const BLOCK_VAR_RE = /\{\{#(?:each|if|unless)\s+(\w+)\}\}/g;

const FILTER_RE = /\{\{(\w+(?:\.\w+)*)\s*\|([^}]+)\}\}/g;

const BLOCKED_PROPS = new Set(['__proto__', 'constructor', 'prototype']);
const KEYWORDS = new Set(['if', 'else', 'unless', 'each', 'this']);

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /\w/.test(ch);
}

type ScanTarget = 'close' | 'else';

/**
 * Generic depth-tracking scanner used by both findMatchingClose and findElseAtDepth0.
 * Walks `template` from `startIndex`, tracking depth via open/close tags that use
 * exact tag-name matching (no prefix matches).
 * - target='close': returns the index where the matching close tag brings depth to 0.
 * - target='else': starts at depth 0 and returns the index of `{{else}}` at depth 0.
 */
function scanAtDepth0(
  template: string,
  openTags: string[],
  closeTags: string[],
  startIndex: number,
  target: ScanTarget,
): number {
  let depth = target === 'close' ? 1 : 0;
  let i = startIndex;
  while (i < template.length) {
    // Check for {{else}} at depth 0 when searching for else
    if (target === 'else' && template.startsWith('{{else}}', i) && depth === 0) {
      return i;
    }
    let matched = false;
    for (const tag of openTags) {
      if (template.startsWith(tag, i) && !isWordChar(template[i + tag.length])) {
        depth++;
        i += tag.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      for (const tag of closeTags) {
        if (template.startsWith(tag, i)) {
          depth--;
          if (target === 'close' && depth === 0) return i;
          i += tag.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) i++;
  }
  return -1;
}

function findMatchingClose(template: string, openTag: string, closeTag: string, startIndex: number): number {
  return scanAtDepth0(template, [openTag], [closeTag], startIndex, 'close');
}

function findElseAtDepth0(body: string): number {
  return scanAtDepth0(body, ['{{#if', '{{#unless'], ['{{/if}}', '{{/unless}}'], 0, 'else');
}

function replaceAtDepth0(body: string, regex: RegExp, replacement: string | ((match: string, ...args: string[]) => string)): string {
  // Protect nested {{#each}}...{{/each}} blocks from replacement
  const id = Math.random().toString(36).slice(2, 10);
  const nested: string[] = [];
  let protected_ = body;
  const eachOpenRe = /\{\{#each\s+\w+\}\}/;
  let m: RegExpMatchArray | null;
  while ((m = eachOpenRe.exec(protected_)) !== null) {
    const start = m.index!;
    const bodyStart = start + m[0].length;
    const closeIndex = findMatchingClose(protected_, '{{#each', '{{/each}}', bodyStart);
    if (closeIndex === -1) break;
    const end = closeIndex + '{{/each}}'.length;
    const block = protected_.slice(start, end);
    const placeholder = `\x00${id}_NESTED_${nested.length}\x00`;
    nested.push(block);
    protected_ = protected_.slice(0, start) + placeholder + protected_.slice(end);
  }
  // Apply replacement only at depth 0
  if (typeof replacement === 'string') {
    protected_ = protected_.replace(regex, replacement);
  } else {
    protected_ = protected_.replace(regex, replacement as (...args: string[]) => string);
  }
  // Restore nested blocks
  for (let i = nested.length - 1; i >= 0; i--) {
    protected_ = protected_.replace(`\x00${id}_NESTED_${i}\x00`, nested[i]);
  }
  return protected_;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateValue = string | number | boolean | null | undefined | any[] | Record<string, any>;

export interface PromptTemplateConfig {
  template: string;
  variables?: Record<string, TemplateValue>;
  partials?: Record<string, PromptTemplate>;
}

type FilterFn = (value: string, ...args: string[]) => string;

function splitFilterChain(chain: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < chain.length; i++) {
    const ch = chain[i];
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === '|' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const BUILTIN_FILTERS: Record<string, FilterFn> = {
  uppercase: (v) => v.toUpperCase(),
  lowercase: (v) => v.toLowerCase(),
  trim: (v) => v.trim(),
  json: (v) => {
    try { return JSON.stringify(JSON.parse(v)); } catch { return JSON.stringify(v); }
  },
  default: (v, fallback) => (v === '' || v === 'undefined' || v === 'null') ? fallback : v,
};

function applyFilterChain(value: string, filterChain: string): string {
  let result = value;
  const filters = splitFilterChain(filterChain);
  for (const filterExpr of filters) {
    const parenMatch = filterExpr.match(/^(\w+)\(([^)]*)\)$/);
    const filterName = parenMatch ? parenMatch[1] : filterExpr;
    const args = parenMatch ? [parenMatch[2].replace(/^['"]|['"]$/g, '')] : [];
    const filterFn = BUILTIN_FILTERS[filterName];
    if (filterFn) {
      result = filterFn(result, ...args);
    }
  }
  return result;
}

export class PromptTemplate {
  constructor(private readonly config: PromptTemplateConfig) {}

  compile(overrides?: Record<string, TemplateValue>): string {
    const variables: Record<string, TemplateValue> = { ...this.config.variables, ...overrides };
    let compiled = this.config.template;

    // 1. Handle partials first {{>partialName}}
    compiled = compiled.replace(PARTIAL_RE, (_match, partialName) => {
      const partial = this.config.partials?.[partialName];
      if (!partial) {
        throw new Error(`Partial "${partialName}" not found`);
      }
      return partial.compile(variables);
    });

    // 2. Handle loops {{#each items}}...{{/each}}
    compiled = this.processLoops(compiled, variables);

    // 3. Handle conditionals {{#if}}...{{/if}} and {{#unless}}...{{/unless}}
    compiled = this.processConditionals(compiled, variables);

    // 4. Handle filters {{var | filter}}
    compiled = this.processFilters(compiled, variables);

    // 5. Handle variables {{var}}
    compiled = compiled.replace(VARIABLE_RE, (_match, varName) => {
      if (KEYWORDS.has(varName)) return '';
      if (!(varName in variables)) {
        throw new Error(`Required variable "${varName}" is missing`);
      }
      return String(variables[varName]);
    });

    return compiled;
  }

  private processLoops(template: string, variables: Record<string, TemplateValue>): string {
    const openRe = /\{\{#each\s+(\w+)\}\}/;
    let result = template;
    let match: RegExpMatchArray | null;
    while ((match = openRe.exec(result)) !== null) {
      const varName = match[1];
      const bodyStart = match.index! + match[0].length;
      const closeIndex = findMatchingClose(result, '{{#each', '{{/each}}', bodyStart);
      if (closeIndex === -1) break;
      const body = result.slice(bodyStart, closeIndex);
      const items = variables[varName];
      let replacement = '';
      if (Array.isArray(items)) {
        replacement = items.map((item, index) => {
          let r = body;
          r = replaceAtDepth0(r, /\{\{@index\}\}/g, String(index));
          r = replaceAtDepth0(r, /\{\{this\.(\w+)\s*\|([^}]+)\}\}/g, (_m: string, prop: string, filterChain: string) => {
            let value = '';
            if (item != null && typeof item === 'object' && Object.hasOwn(item as object, prop)) {
              value = String(item[prop]);
            }
            return applyFilterChain(value, filterChain);
          });
          r = replaceAtDepth0(r, /\{\{this\s*\|([^}]+)\}\}/g, (_m: string, filterChain: string) => {
            return applyFilterChain(String(item), filterChain);
          });
          r = replaceAtDepth0(r, /\{\{this\.(\w+)\}\}/g, (_m: string, prop: string) => {
            if (item != null && typeof item === 'object' && Object.hasOwn(item as object, prop)) {
              return String(item[prop]);
            }
            return '';
          });
          r = replaceAtDepth0(r, /\{\{this\}\}/g, String(item));
          r = this.processConditionals(r, variables);
          return r;
        }).join('');
      }
      result = result.slice(0, match.index!) + replacement + result.slice(closeIndex + '{{/each}}'.length);
    }
    return result;
  }

  private processConditionals(template: string, variables: Record<string, TemplateValue>): string {
    let compiled = template;

    // Handle {{#unless condition}}...{{/unless}}
    const unlessRe = /\{\{#unless\s+(\w+)\}\}/;
    let match: RegExpMatchArray | null;
    while ((match = unlessRe.exec(compiled)) !== null) {
      const varName = match[1];
      const bodyStart = match.index! + match[0].length;
      const closeIndex = findMatchingClose(compiled, '{{#unless', '{{/unless}}', bodyStart);
      if (closeIndex === -1) break;
      const body = compiled.slice(bodyStart, closeIndex);
      const value = variables[varName];
      const elseIndex = findElseAtDepth0(body);
      let replacement: string;
      if (elseIndex !== -1) {
        const falseBranch = body.slice(0, elseIndex);
        const trueBranch = body.slice(elseIndex + '{{else}}'.length);
        replacement = !value ? falseBranch : trueBranch;
      } else {
        replacement = !value ? body : '';
      }
      compiled = compiled.slice(0, match.index!) + replacement + compiled.slice(closeIndex + '{{/unless}}'.length);
    }

    // Handle {{#if condition}}...{{else}}...{{/if}} and {{#if condition}}...{{/if}}
    const ifRe = /\{\{#if\s+(\w+)\}\}/;
    while ((match = ifRe.exec(compiled)) !== null) {
      const varName = match[1];
      const bodyStart = match.index! + match[0].length;
      const closeIndex = findMatchingClose(compiled, '{{#if', '{{/if}}', bodyStart);
      if (closeIndex === -1) break;
      const body = compiled.slice(bodyStart, closeIndex);
      const value = variables[varName];
      const elseIndex = findElseAtDepth0(body);
      let replacement: string;
      if (elseIndex !== -1) {
        const trueBranch = body.slice(0, elseIndex);
        const falseBranch = body.slice(elseIndex + '{{else}}'.length);
        replacement = value ? trueBranch : falseBranch;
      } else {
        replacement = value ? body : '';
      }
      compiled = compiled.slice(0, match.index!) + replacement + compiled.slice(closeIndex + '{{/if}}'.length);
    }

    return compiled;
  }

  private processFilters(template: string, variables: Record<string, TemplateValue>): string {
    return template.replace(FILTER_RE, (_match, varPath, filterChain) => {
      // Resolve variable value (supports dot notation for nested access)
      const rootVar = varPath.includes('.') ? varPath.split('.')[0] : varPath;

      // Throw for missing root variable (consistent with compile step 5)
      if (!(rootVar in variables)) {
        throw new Error(`Required variable "${rootVar}" is missing`);
      }

      let value: TemplateValue;
      if (varPath.includes('.')) {
        const parts = varPath.split('.');
        if (BLOCKED_PROPS.has(parts[0])) { return ''; }
        value = variables[parts[0]];
        for (let i = 1; i < parts.length && value != null; i++) {
          if (BLOCKED_PROPS.has(parts[i])) { return ''; }
          value = (value as Record<string, TemplateValue>)[parts[i]];
        }
      } else {
        value = variables[varPath];
      }

      const result = value != null ? String(value) : '';
      return applyFilterChain(result, filterChain as string);
    });
  }

  extend(overrides: Partial<PromptTemplateConfig>): PromptTemplate {
    return new PromptTemplate({
      template: overrides.template ?? this.config.template,
      variables: { ...this.config.variables, ...overrides.variables } as Record<string, TemplateValue>,
      partials: { ...this.config.partials, ...overrides.partials }
    });
  }

  get requiredVariables(): string[] {
    const variables = new Set<string>();
    
    // Extract variables from simple {{var}} tags
    const variableMatches = this.config.template.match(VARIABLE_RE) || [];
    variableMatches.forEach(match => {
      const varName = match.slice(2, -2);
      if (!varName.startsWith('>') && !KEYWORDS.has(varName)) {
        variables.add(varName);
      }
    });

    // Extract variables from block tags {{#each items}}, {{#if show}}, {{#unless hidden}}
    const blockMatches = this.config.template.matchAll(BLOCK_VAR_RE);
    for (const bm of blockMatches) {
      if (!KEYWORDS.has(bm[1])) {
        variables.add(bm[1]);
      }
    }

    // Extract root variables from filter expressions {{var | filter}} or {{var.prop | filter}}
    const filterMatches = this.config.template.matchAll(FILTER_RE);
    for (const fm of filterMatches) {
      const rootVar = fm[1].split('.')[0];
      if (!KEYWORDS.has(rootVar)) {
        variables.add(rootVar);
      }
    }

    // Extract variables from partials
    if (this.config.partials) {
      Object.values(this.config.partials).forEach(partial => {
        partial.requiredVariables.forEach(varName => variables.add(varName));
      });
    }

    return Array.from(variables).sort();
  }

  static from(template: string): PromptTemplate {
    return new PromptTemplate({ template });
  }
}