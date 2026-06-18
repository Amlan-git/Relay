import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectTrivial } from "./index";

const WORKFLOWS_DIR = join(__dirname, "..", "..", "eval", "workflows");

interface RawNode {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
}
interface RawWorkflow {
  nodes: RawNode[];
}

function loadWorkflow(file: string): RawWorkflow {
  return JSON.parse(readFileSync(join(WORKFLOWS_DIR, file), "utf8"));
}
function nodeByName(wf: RawWorkflow, name: string): RawNode {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node ${name} not in workflow`);
  return n;
}

describe("detectTrivial", () => {
  const audio = loadWorkflow("Audio to notion.json");
  const errorMon = loadWorkflow(
    "Automated hourly n8n error monitoring with Slack notifications.json",
  );

  it("flags set nodes as trivial (Config)", () => {
    expect(detectTrivial(nodeByName(errorMon, "Config"))).toBe(true);
  });

  it("flags stickyNote nodes as trivial", () => {
    expect(detectTrivial(nodeByName(errorMon, "Sticky Note"))).toBe(true);
  });

  it("flags editFields nodes as trivial", () => {
    expect(
      detectTrivial({
        id: "1",
        name: "Edit",
        type: "n8n-nodes-base.editFields",
      }),
    ).toBe(true);
  });

  it("does not flag Slack as trivial", () => {
    expect(detectTrivial(nodeByName(errorMon, "Slack"))).toBe(false);
  });

  it("does not flag Notion as trivial", () => {
    expect(detectTrivial(nodeByName(audio, "Notion"))).toBe(false);
  });

  it("does not flag OpenAI as trivial", () => {
    expect(detectTrivial(nodeByName(audio, "OpenAI"))).toBe(false);
  });

  it("does not flag HTTP nodes as trivial", () => {
    expect(
      detectTrivial({
        id: "1",
        name: "HTTP",
        type: "n8n-nodes-base.httpRequest",
      }),
    ).toBe(false);
  });

  it("does not flag triggers as trivial", () => {
    expect(detectTrivial(nodeByName(audio, "Google Drive Trigger"))).toBe(
      false,
    );
  });

  it("does not flag conditionals as trivial", () => {
    expect(
      detectTrivial({ id: "1", name: "If", type: "n8n-nodes-base.if" }),
    ).toBe(false);
  });
});
