// =============================================================================
// CLI Format — ANSI color helpers (zero dependencies)
// =============================================================================

const CODES: Record<string, string> = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

export function color(name: keyof typeof CODES, text: string): string {
  if (!process.stdout.isTTY) return text;
  return `${CODES[name]}${text}${CODES.reset}`;
}

export function bold(text: string): string {
  if (!process.stdout.isTTY) return text;
  return `${CODES.bold}${text}${CODES.reset}`;
}
