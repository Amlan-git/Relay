/**
 * Eval runner — loads workflows + gold SOPs, runs the parser and Stage 1 draft
 * agent, scores each pair against gold, writes a markdown report to eval/reports/.
 *
 * Stage 1 (draft) wired in via lib/agent/draft#draftSOP. Stage 2 (verify) lands
 * in step 4.
 *
 * Run with: npm run eval
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local before any module that reads process.env. Next.js does this
// automatically; tsx scripts do not. Lightweight inline parser — no extra dep.
(function loadDotEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

import { draftSOP } from "../lib/agent/draft";
import { DRAFT_MODEL } from "../lib/gemini";
import { parse } from "../lib/parser";
import type { WorkflowRepresentation } from "../lib/parser/types";
import { scoreSOP, type SOP, type SOPScore } from "./score";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = join(__dirname, "workflows");
const GOLD_DIR = join(__dirname, "gold");
const REPORTS_DIR = join(__dirname, "reports");

interface EvalCase {
  name: string;
  workflowJson: unknown;
  goldSOP: SOP;
}

interface EvalResult extends EvalCase {
  representation: WorkflowRepresentation;
  generatedSOP: SOP;
  score: SOPScore;
}

async function stubAgent(
  representation: WorkflowRepresentation,
): Promise<SOP> {
  return {
    overview: `[stub] Overview for ${representation.workflowName}.`,
    atAGlance: `[stub] At a Glance for ${representation.workflowName}.`,
    howItWorks: `[stub] How It Works for ${representation.workflowName}.`,
    troubleshooting: `[stub] Troubleshooting for ${representation.workflowName}.`,
  };
}

type AgentFn = (rep: WorkflowRepresentation) => Promise<SOP>;

interface AgentChoice {
  agent: AgentFn;
  mode: "live" | "stub";
}

function selectAgent(): AgentChoice {
  if (process.env.GEMINI_API_KEY) {
    return { agent: draftSOP, mode: "live" };
  }
  return { agent: stubAgent, mode: "stub" };
}

function parseGoldMarkdown(markdown: string): SOP {
  const sections: Record<string, string> = {
    overview: "",
    atAGlance: "",
    howItWorks: "",
    troubleshooting: "",
  };
  const headingMap: Record<string, keyof typeof sections> = {
    overview: "overview",
    "at a glance": "atAGlance",
    "how it works": "howItWorks",
    troubleshooting: "troubleshooting",
  };

  let current: keyof typeof sections | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const headingMatch = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (headingMatch) {
      const key = headingMatch[1].toLowerCase().trim();
      if (key in headingMap) {
        current = headingMap[key];
        continue;
      }
    }
    if (current) {
      sections[current] += line + "\n";
    }
  }

  return {
    overview: sections.overview.trim(),
    atAGlance: sections.atAGlance.trim(),
    howItWorks: sections.howItWorks.trim(),
    troubleshooting: sections.troubleshooting.trim(),
  };
}

interface ParserOnly {
  name: string;
  representation: WorkflowRepresentation;
  generatedSOP?: SOP;
}

function loadCasesAndParserOnly(): { cases: EvalCase[]; parserOnly: ParserOnly[] } {
  let workflowFiles: string[] = [];
  try {
    workflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return { cases: [], parserOnly: [] };
  }

  const cases: EvalCase[] = [];
  const parserOnly: ParserOnly[] = [];
  for (const file of workflowFiles) {
    const name = basename(file, extname(file));
    const workflowJson = JSON.parse(
      readFileSync(join(WORKFLOWS_DIR, file), "utf8"),
    );
    const goldPath = join(GOLD_DIR, `${name}.md`);
    let goldSOP: SOP | null = null;
    try {
      goldSOP = parseGoldMarkdown(readFileSync(goldPath, "utf8"));
    } catch {
      console.warn(
        `[eval] no gold SOP for ${name} — including parser output only`,
      );
    }
    if (goldSOP) {
      cases.push({ name, workflowJson, goldSOP });
    } else {
      parserOnly.push({ name, representation: parse(workflowJson) });
    }
  }
  return { cases, parserOnly };
}

function formatRepresentation(rep: WorkflowRepresentation): string[] {
  const lines: string[] = [];
  lines.push(`### Parsed representation — ${rep.workflowName || "(unnamed)"}`);
  lines.push("");
  lines.push(`- Systems: ${rep.systems.join(", ") || "(none)"}`);
  lines.push(
    `- Triggers: ${rep.triggerNodeIds.length} · destinations: ${rep.destinationNodeIds.length} · total nodes: ${rep.nodes.length}`,
  );
  lines.push(
    `- Error handling: ${
      rep.errorHandling.hasErrorWorkflow
        ? `yes (errorWorkflow=${rep.errorHandling.errorWorkflowId ?? "-"}, errorTriggerNodes=${rep.errorHandling.errorTriggerNodeIds.length})`
        : "no"
    }`,
  );
  lines.push("");
  lines.push("| Node | Type | Classification | Trivial | Up→Down | Failure modes |");
  lines.push("|---|---|---|---|---|---|");
  for (const n of rep.nodes) {
    const failureLabels = n.failureModes.map((f) => f.description).join("; ");
    lines.push(
      `| ${n.name} | \`${n.type}\` | ${n.classification} | ${n.isTrivial ? "yes" : "no"} | ${n.upstreamNodeIds.length}→${n.downstreamNodeIds.length} | ${failureLabels || "-"} |`,
    );
  }
  lines.push("");
  return lines;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + "…";
}

function formatGeneratedSOP(name: string, sop: SOP): string[] {
  const lines: string[] = [];
  lines.push(`#### ${name}`);
  lines.push("");
  lines.push("**Overview**");
  lines.push("");
  lines.push(truncate(sop.overview, 600));
  lines.push("");
  lines.push("**At a Glance**");
  lines.push("");
  lines.push(truncate(sop.atAGlance, 600));
  lines.push("");
  lines.push("**How It Works**");
  lines.push("");
  lines.push(truncate(sop.howItWorks, 600));
  lines.push("");
  lines.push("**Troubleshooting**");
  lines.push("");
  lines.push(truncate(sop.troubleshooting, 600));
  lines.push("");
  return lines;
}

interface AgentFailure {
  name: string;
  error: string;
}

function formatReport(
  results: EvalResult[],
  parserOnly: ParserOnly[] = [],
  mode: "live" | "stub" = "stub",
  failures: AgentFailure[] = [],
): string {
  const lines: string[] = [];
  lines.push("# Eval Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    mode === "live"
      ? `> Stage 1 (draft) wired in — model: \`${DRAFT_MODEL}\` called per workflow.`
      : "> Stage 1 (draft) wired in but no `GEMINI_API_KEY` — fell back to stub output.",
  );
  lines.push(
    "> Stage 2 (verify) uses deterministic significant-node coverage and explicit node-reference hallucination checks.",
  );
  lines.push("");

  if (results.length === 0 && parserOnly.length === 0) {
    if (failures.length > 0) {
      lines.push(
        `All ${failures.length} Gemini calls failed. First error: ${failures[0].error}. Re-run when upstream capacity recovers.`,
      );
    } else {
      lines.push("No workflows found in `eval/workflows/`.");
    }
    return lines.join("\n");
  }

  if (results.length === 0) {
    lines.push(
      "_No workflow/gold pairs scored — parser-only output + generated SOPs below._",
    );
    lines.push("");
    if (parserOnly.some((p) => p.generatedSOP)) {
      lines.push("## Generated SOPs");
      lines.push("");
      for (const p of parserOnly) {
        if (p.generatedSOP) {
          lines.push(...formatGeneratedSOP(p.name, p.generatedSOP));
        }
      }
    }
    lines.push("## Parser output");
    lines.push("");
    for (const p of parserOnly) {
      lines.push(`#### ${p.name}`);
      lines.push("");
      lines.push(...formatRepresentation(p.representation));
    }
    return lines.join("\n");
  }

  let totalCompleteness = 0;
  let totalHallucinations = 0;
  let totalInferred = 0;

  lines.push("## Per-workflow scores");
  lines.push("");
  lines.push("| Workflow | Nodes | Systems | Structural completeness | Pass | Missing nodes | Hallucinations | Inferred token overlap |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    totalCompleteness += r.score.structuralCompleteness;
    totalHallucinations += r.score.hallucinationCount;
    totalInferred += r.score.inferredSectionScore;
    const missing = r.score.missingNodes.length
      ? r.score.missingNodes.join(", ")
      : "-";
    const hallucinated = r.score.hallucinatedNodes.length
      ? r.score.hallucinatedNodes.join(", ")
      : "-";
    lines.push(
      `| ${r.name} | ${r.representation.nodes.length} | ${r.representation.systems.length} | ${(r.score.structuralCompleteness * 100).toFixed(1)}% | ${r.score.passed ? "PASS" : "FAIL"} | ${missing} | ${hallucinated} | ${(r.score.inferredSectionScore * 100).toFixed(1)}% |`,
    );
  }

  const n = results.length;
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push(`- Avg structural completeness: ${((totalCompleteness / n) * 100).toFixed(1)}%`);
  lines.push(`- Total hallucinations: ${totalHallucinations}`);
  lines.push(`- Passing workflows: ${results.filter((r) => r.score.passed).length}/${n}`);
  lines.push(`- Avg inferred-section score: ${((totalInferred / n) * 100).toFixed(1)}%`);
  lines.push("");

  lines.push("## Generated SOPs");
  lines.push("");
  for (const r of results) {
    lines.push(...formatGeneratedSOP(r.name, r.generatedSOP));
  }
  for (const p of parserOnly) {
    if (p.generatedSOP) {
      lines.push(...formatGeneratedSOP(`${p.name} (no gold pair)`, p.generatedSOP));
    }
  }

  lines.push("## Parser output");
  lines.push("");
  for (const r of results) {
    lines.push(...formatRepresentation(r.representation));
  }
  for (const p of parserOnly) {
    lines.push(`#### ${p.name} (parser-only — no gold SOP yet)`);
    lines.push("");
    lines.push(...formatRepresentation(p.representation));
  }

  return lines.join("\n");
}

async function main() {
  const { cases, parserOnly } = loadCasesAndParserOnly();
  const { agent, mode } = selectAgent();
  console.log(
    `[eval] loaded ${cases.length} scored case(s) + ${parserOnly.length} parser-only (agent=${mode})`,
  );
  if (mode === "stub") {
    console.warn(
      "[eval] GEMINI_API_KEY not set — using stub agent. Add it to .env.local for the live baseline.",
    );
  }

  for (const p of parserOnly) {
    console.log(
      `[eval] ${p.name} (parser-only): nodes=${p.representation.nodes.length} systems=${p.representation.systems.length} triggers=${p.representation.triggerNodeIds.length} destinations=${p.representation.destinationNodeIds.length}`,
    );
  }

  const failures: AgentFailure[] = [];
  const results: EvalResult[] = [];
  for (const c of cases) {
    const representation = parse(c.workflowJson);
    try {
      const generatedSOP = await agent(representation);
      const score = scoreSOP(generatedSOP, c.goldSOP, representation);
      results.push({ ...c, representation, generatedSOP, score });
      console.log(
        `[eval] ${c.name}: nodes=${representation.nodes.length} systems=${representation.systems.length} completeness=${(score.structuralCompleteness * 100).toFixed(1)}% pass=${score.passed ? "yes" : "no"} missing=${score.missingNodes.length} hallucinations=${score.hallucinationCount}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      failures.push({ name: c.name, error: msg });
      console.warn(`[eval] ${c.name}: agent failed — ${msg}`);
    }
  }

  for (const p of parserOnly) {
    try {
      p.generatedSOP = await agent(p.representation);
      console.log(
        `[eval] ${p.name} (parser-only): generated SOP (${p.generatedSOP.overview.length + p.generatedSOP.atAGlance.length + p.generatedSOP.howItWorks.length + p.generatedSOP.troubleshooting.length} chars)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
      failures.push({ name: p.name, error: msg });
      console.warn(`[eval] ${p.name}: agent failed — ${msg}`);
    }
  }

  const report = formatReport(results, parserOnly, mode, failures);
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = mode === "live" ? "baseline-v1" : "report";
  const reportPath = join(REPORTS_DIR, `${prefix}-${stamp}.md`);
  writeFileSync(reportPath, report);
  console.log(`[eval] wrote ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
