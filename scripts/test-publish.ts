/**
 * Step 6 smoke test — parse one eval workflow, draft an SOP via Gemini,
 * publish to Notion, print the resulting page URL.
 *
 * Run with: npx tsx scripts/test-publish.ts [workflowBasename]
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

(function loadDotEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
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
import { parse } from "../lib/parser";
import { publishSOP } from "../lib/notion/publish";
import type { SOP } from "../lib/agent/types";

function stubSOPFor(workflowName: string, nodeCount: number): SOP {
  return {
    overview: `This is a smoke-test SOP for the **${workflowName}** workflow, used to verify the Relay Notion publisher end-to-end without consuming Gemini quota.`,
    atAGlance: [
      `- **Workflow:** ${workflowName}`,
      `- **Node count:** ${nodeCount}`,
      `- **Trigger:** (stub)`,
      `- **Systems:** (stub)`,
      `- **Error handling:** (stub)`,
    ].join("\n"),
    howItWorks: [
      "1. The trigger fires and the workflow begins.",
      "2. Each node processes its inputs in turn.",
      "3. The final node writes the result to the destination system.",
    ].join("\n"),
    troubleshooting: [
      "- **Auth errors:** re-authenticate the affected node credential.",
      "- **Rate limits:** add a delay node or reduce trigger frequency.",
      "- **Missing data:** check that the upstream system is returning the expected payload.",
    ].join("\n"),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const useStub = args.includes("--stub");
  const arg = args.find((a) => !a.startsWith("--")) ?? "Audio to notion";
  const workflowPath = join(process.cwd(), "eval", "workflows", `${arg}.json`);
  if (!existsSync(workflowPath)) {
    throw new Error(`Workflow not found: ${workflowPath}`);
  }

  console.log(`[1/3] Parsing ${arg}…`);
  const json = JSON.parse(readFileSync(workflowPath, "utf8"));
  const rep = parse(json);

  let sop: SOP;
  if (useStub) {
    console.log(`[2/3] Using stub SOP (--stub) — skipping Gemini.`);
    sop = stubSOPFor(rep.workflowName || arg, rep.nodes.length);
  } else {
    console.log(`[2/3] Drafting SOP via Gemini (${rep.nodes.length} nodes)…`);
    sop = await draftSOP(rep);
  }

  console.log(`[3/3] Publishing to Notion…`);
  const result = await publishSOP(
    sop,
    rep.workflowName || arg,
    `Relay smoke test · workflow: ${arg} · nodes: ${rep.nodes.length}`,
  );

  console.log(`\n✅ Published: ${result.url}`);
  console.log(`   Page ID: ${result.pageId}`);
}

main().catch((err) => {
  console.error("\n❌ Smoke test failed:", err);
  process.exit(1);
});
