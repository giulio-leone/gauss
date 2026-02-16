const PARTIAL_RE = /\{\{>(\w+)\}\}/g;
const VARIABLE_RE = /\{\{(\w+)\}\}/g;

const EACH_RE = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
const IF_RE = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
const UNLESS_RE = /\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g;
const FILTER_RE = /\{\{(\w+(?:\.\w+)*)\s*\|([^}]+)\}\}/g;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TemplateValue = string | number | boolean | null | undefined | any[] | Record<string, any>;

export interface PromptTemplateConfig {
  template: string;
  variables?: Record<string, TemplateValue>;
  partials?: Record<string, PromptTemplate>;
}

type FilterFn = (value: string, ...args: string[]) => string;

const BUILTIN_FILTERS: Record<string, FilterFn> = {
  uppercase: (v) => v.toUpperCase(),
  lowercase: (v) => v.toLowerCase(),
  trim: (v) => v.trim(),
  json: (v) => {
    try { return JSON.stringify(JSON.parse(v)); } catch { return JSON.stringify(v); }
  },
  default: (v, fallback) => (v === '' || v === 'undefined' || v === 'null') ? fallback : v,
};

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
      if (!(varName in variables)) {
        throw new Error(`Required variable "${varName}" is missing`);
      }
      return String(variables[varName]);
    });

    return compiled;
  }

  private processLoops(template: string, variables: Record<string, TemplateValue>): string {
    return template.replace(EACH_RE, (_match, varName, body) => {
      const items = variables[varName];
      if (!Array.isArray(items)) return '';
      return items.map((item, index) => {
        let result = body as string;
        // Replace {{@index}}
        result = result.replace(/\{\{@index\}\}/g, String(index));
        // Replace {{this.property}}
        result = result.replace(/\{\{this\.(\w+)\}\}/g, (_m: string, prop: string) => {
          if (item != null && typeof item === 'object' && prop in item) {
            return String(item[prop]);
          }
          return '';
        });
        // Replace {{this}}
        result = result.replace(/\{\{this\}\}/g, String(item));
        // Process nested conditionals inside loop body
        result = this.processConditionals(result, variables);
        return result;
      }).join('');
    });
  }

  private processConditionals(template: string, variables: Record<string, TemplateValue>): string {
    let compiled = template;

    // Handle {{#unless condition}}...{{/unless}}
    compiled = compiled.replace(UNLESS_RE, (_match, varName, body) => {
      const value = variables[varName];
      return !value ? body : '';
    });

    // Handle {{#if condition}}...{{else}}...{{/if}} and {{#if condition}}...{{/if}}
    compiled = compiled.replace(IF_RE, (_match, varName, body) => {
      const value = variables[varName];
      const elseIndex = body.indexOf('{{else}}');
      if (elseIndex !== -1) {
        const trueBranch = body.slice(0, elseIndex);
        const falseBranch = body.slice(elseIndex + '{{else}}'.length);
        return value ? trueBranch : falseBranch;
      }
      return value ? body : '';
    });

    return compiled;
  }

  private processFilters(template: string, variables: Record<string, TemplateValue>): string {
    return template.replace(FILTER_RE, (_match, varPath, filterChain) => {
      // Resolve variable value (supports dot notation for nested access)
      let value: TemplateValue;
      if (varPath.includes('.')) {
        const parts = varPath.split('.');
        value = variables[parts[0]];
        for (let i = 1; i < parts.length && value != null; i++) {
          value = (value as Record<string, TemplateValue>)[parts[i]];
        }
      } else {
        value = variables[varPath];
      }

      let result = value != null ? String(value) : '';

      // Apply filter chain
      const filters = (filterChain as string).split('|').map((f: string) => f.trim());
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
    
    // Extract variables from template
    const variableMatches = this.config.template.match(VARIABLE_RE) || [];
    variableMatches.forEach(match => {
      const varName = match.slice(2, -2);
      if (!varName.startsWith('>')) { // Skip partials
        variables.add(varName);
      }
    });

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