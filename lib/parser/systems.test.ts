import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractSystems } from "./index";

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

describe("extractSystems", () => {
  it("extracts the three external systems from the linear Audio→Notion workflow", () => {
    const wf = loadWorkflow("Audio to notion.json");
    expect(extractSystems(wf.nodes)).toEqual([
      "Google Drive",
      "Notion",
      "OpenAI",
    ]);
  });

  it("includes Slack from the error monitoring workflow", () => {
    const wf = loadWorkflow(
      "Automated hourly n8n error monitoring with Slack notifications.json",
    );
    expect(extractSystems(wf.nodes)).toContain("Slack");
  });

  it("includes HubSpot and Jira from the support routing workflow", () => {
    const wf = loadWorkflow(
      "Automate support ticket classification & routing from HubSpot to Jira with GPT.json",
    );
    const systems = extractSystems(wf.nodes);
    expect(systems).toContain("HubSpot");
    expect(systems).toContain("Jira");
  });

  it("deduplicates when multiple nodes target the same system", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "Slack A", type: "n8n-nodes-base.slack" },
      { id: "2", name: "Slack B", type: "n8n-nodes-base.slack" },
    ];
    expect(extractSystems(nodes)).toEqual(["Slack"]);
  });

  it("returns a sorted, alphabetised list", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "n", type: "n8n-nodes-base.notion" },
      { id: "2", name: "a", type: "n8n-nodes-base.airtable" },
      { id: "3", name: "s", type: "n8n-nodes-base.slack" },
    ];
    expect(extractSystems(nodes)).toEqual(["Airtable", "Notion", "Slack"]);
  });

  it("splits camelCase node-type suffixes into Title Case (Google Sheets)", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "n", type: "n8n-nodes-base.googleSheets" },
    ];
    expect(extractSystems(nodes)).toEqual(["Google Sheets"]);
  });

  it("skips control-flow / pure-data types", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "a", type: "n8n-nodes-base.set" },
      { id: "2", name: "b", type: "n8n-nodes-base.editFields" },
      { id: "3", name: "c", type: "n8n-nodes-base.if" },
      { id: "4", name: "d", type: "n8n-nodes-base.switch" },
      { id: "5", name: "e", type: "n8n-nodes-base.code" },
      { id: "6", name: "f", type: "n8n-nodes-base.stickyNote" },
      { id: "7", name: "g", type: "n8n-nodes-base.splitInBatches" },
      { id: "8", name: "h", type: "n8n-nodes-base.executeWorkflow" },
      { id: "9", name: "i", type: "n8n-nodes-base.manualTrigger" },
      { id: "10", name: "j", type: "n8n-nodes-base.scheduleTrigger" },
      { id: "11", name: "k", type: "n8n-nodes-base.errorTrigger" },
      { id: "12", name: "l", type: "n8n-nodes-base.executeWorkflowTrigger" },
    ];
    expect(extractSystems(nodes)).toEqual([]);
  });

  it("counts a trigger that references an external system (Google Drive Trigger → Google Drive)", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "t", type: "n8n-nodes-base.googleDriveTrigger" },
    ];
    expect(extractSystems(nodes)).toEqual(["Google Drive"]);
  });
});
