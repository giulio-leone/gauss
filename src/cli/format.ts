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

// Spinner for "thinking" indicator
export function createSpinner(text: string): { stop: (finalText?: string) => void } {
  if (!process.stdout.isTTY) {
    process.stdout.write(`${text}...\n`);
    return { stop: () => {} };
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${CODES.cyan}${frames[i++ % frames.length]} ${text}${CODES.reset}`);
  }, 80);
  return {
    stop(finalText?: string) {
      clearInterval(timer);
      process.stdout.write(`\r${" ".repeat(text.length + 4)}\r`);
      if (finalText) process.stdout.write(finalText);
    },
  };
}

// Format elapsed time
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Box drawing for nice output
export function box(title: string, content: string): string {
  const lines = content.split("\n");
  const maxLen = Math.max(title.length, ...lines.map(l => l.length));
  const hr = "─".repeat(maxLen + 2);
  const top = `┌${hr}┐`;
  const bottom = `└${hr}┘`;
  const titleLine = `│ ${title.padEnd(maxLen)} │`;
  const sep = `├${hr}┤`;
  const body = lines.map(l => `│ ${l.padEnd(maxLen)} │`).join("\n");
  return `${top}\n${titleLine}\n${sep}\n${body}\n${bottom}`;
}
