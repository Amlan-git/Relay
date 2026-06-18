/**
 * Prompt loader — reads markdown prompt files from lib/agent/prompts/.
 *
 * Prompts live as plain markdown so they diff cleanly in the
 * prompts-history/ snapshots and the walkthrough can show the
 * iteration arc directly.
 *
 * Path resolution: anchored at process.cwd() so the loader works
 * identically under tsx (eval harness, ESM) and jest (CommonJS).
 * Both runtimes are invoked from the project root via npm scripts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(process.cwd(), "lib", "agent", "prompts");

export function loadPrompt(name: string): string {
  const path = join(PROMPTS_DIR, `${name}.md`);
  return readFileSync(path, "utf8");
}

export function promptsDir(): string {
  return PROMPTS_DIR;
}
