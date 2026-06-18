/**
 * Draft tests.
 *
 * Default jest run is hermetic — only offline unit tests execute.
 * Live Gemini integration test is gated behind RUN_LIVE_GEMINI_TESTS=1
 * (plus a non-empty GEMINI_API_KEY) per amendment #6.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "../parser";
import {
  buildDraftPrompt,
  draftSOP,
  serializeRepresentation,
  summarizeParameters,
} from "./draft";

const WORKFLOWS_DIR = join(__dirname, "..", "..", "eval", "workflows");
function loadJson(file: string): unknown {
  return JSON.parse(readFileSync(join(WORKFLOWS_DIR, file), "utf8"));
}

describe("summarizeParameters — safety + compactness", () => {
  it("returns empty for missing/empty input", () => {
    expect(summarizeParameters(undefined)).toEqual({});
    expect(summarizeParameters({})).toEqual({});
  });

  it("redacts credential-shaped keys", () => {
    const out = summarizeParameters({
      apiKey: "sk-live-abc123",
      authToken: "Bearer xyz",
      password: "hunter2",
      clientSecret: "shh",
      credentials: { hubspotApi: "abc" },
      Authorization: "Bearer 123",
    });
    for (const v of Object.values(out)) {
      expect(v).toBe("[redacted]");
    }
  });

  it("redacts URLs containing token-like query params", () => {
    const out = summarizeParameters({
      url: "https://hooks.example.com/svc?token=secrettoken123",
    });
    expect(out.url).toBe("[redacted-url]");
  });

  it("truncates long string values to ~200 chars", () => {
    const longText = "a".repeat(500);
    const out = summarizeParameters({ promptText: longText });
    expect(typeof out.promptText).toBe("string");
    expect((out.promptText as string).length).toBeLessThanOrEqual(220);
    expect(out.promptText).toMatch(/\.\.\.$/);
  });

  it("preserves short safe scalars", () => {
    expect(summarizeParameters({ operation: "send", limit: 5 })).toEqual({
      operation: "send",
      limit: 5,
    });
  });

  it("summarises nested objects without serialising raw n8n control fields", () => {
    const out = summarizeParameters({
      messages: { values: [{ content: "hi" }, { content: "there" }] },
      stickyShape: { __rl: true, mode: "list", value: "secret-folder-id" },
    });
    // nested object types should be represented as a short structural label,
    // not exfiltrated verbatim
    expect(out.messages).toMatch(/^\[object/);
    expect(out.stickyShape).toMatch(/^\[object/);
  });
});

describe("serializeRepresentation — includes the spec'd payload", () => {
  const rep = parse(loadJson("Audio to notion.json"));
  const json = serializeRepresentation(rep);
  const parsed = JSON.parse(json);

  it("includes workflow-level metadata", () => {
    expect(parsed.workflowName).toBe("Audio to notion");
    expect(parsed.systems).toEqual(["Google Drive", "Notion", "OpenAI"]);
    expect(parsed.triggerNodeIds.length).toBe(1);
    expect(parsed.destinationNodeIds.length).toBe(1);
    expect(parsed.errorHandling.hasErrorWorkflow).toBe(false);
  });

  it("emits every node with id, name, classification, type, isTrivial, edges, parameters, failureModes", () => {
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(parsed.nodes.length).toBe(rep.nodes.length);
    for (const n of parsed.nodes) {
      expect(typeof n.id).toBe("string");
      expect(typeof n.name).toBe("string");
      expect(typeof n.type).toBe("string");
      expect(typeof n.classification).toBe("string");
      expect(typeof n.isTrivial).toBe("boolean");
      expect(Array.isArray(n.upstreamNodeIds)).toBe(true);
      expect(Array.isArray(n.downstreamNodeIds)).toBe(true);
      expect(typeof n.parameterSummary).toBe("object");
      expect(Array.isArray(n.failureModes)).toBe(true);
    }
  });

  it("includes the canonical node names from the source workflow", () => {
    const names = parsed.nodes.map((n: { name: string }) => n.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Google Drive Trigger",
        "Google Drive",
        "OpenAI",
        "Notion",
      ]),
    );
  });

  it("does not leak raw n8n internal shapes (e.g. __rl)", () => {
    expect(json).not.toMatch(/__rl/);
  });
});

describe("buildDraftPrompt — template substitution", () => {
  const rep = parse(loadJson("Audio to notion.json"));
  const prompt = buildDraftPrompt(rep);

  it("contains the four SOP section headings", () => {
    expect(prompt).toMatch(/Overview/);
    expect(prompt).toMatch(/At a Glance/);
    expect(prompt).toMatch(/How It Works/);
    expect(prompt).toMatch(/Troubleshooting/);
  });

  it("substitutes the workflow representation into the placeholder", () => {
    expect(prompt).not.toMatch(/\{\{REPRESENTATION\}\}/);
    expect(prompt).toMatch(/Google Drive Trigger/);
    expect(prompt).toMatch(/Notion/);
  });
});

// ---------------------------------------------------------------------------
// Live integration test — opt-in via RUN_LIVE_GEMINI_TESTS=1 (amendment #6)
// ---------------------------------------------------------------------------
const liveEnabled =
  process.env.RUN_LIVE_GEMINI_TESTS === "1" && !!process.env.GEMINI_API_KEY;

(liveEnabled ? describe : describe.skip)(
  "draftSOP — live Gemini call",
  () => {
    it(
      "returns a populated four-section SOP for the Audio→Notion workflow",
      async () => {
        const rep = parse(loadJson("Audio to notion.json"));
        const sop = await draftSOP(rep);
        expect(typeof sop.overview).toBe("string");
        expect(sop.overview.length).toBeGreaterThan(0);
        expect(typeof sop.atAGlance).toBe("string");
        expect(sop.atAGlance.length).toBeGreaterThan(0);
        expect(typeof sop.howItWorks).toBe("string");
        expect(sop.howItWorks.length).toBeGreaterThan(0);
        expect(typeof sop.troubleshooting).toBe("string");
        expect(sop.troubleshooting.length).toBeGreaterThan(0);
        expect(sop.atAGlance).toMatch(/notion/i);
      },
      60_000,
    );
  },
);
