import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "./index";
import type { WorkflowRepresentation } from "./types";

const WORKFLOWS_DIR = join(__dirname, "..", "..", "eval", "workflows");

function loadJson(file: string): unknown {
  return JSON.parse(readFileSync(join(WORKFLOWS_DIR, file), "utf8"));
}

function nodeByName(rep: WorkflowRepresentation, name: string) {
  const n = rep.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node ${name} not in parsed representation`);
  return n;
}

describe("parse — Audio to notion (linear)", () => {
  const rep = parse(loadJson("Audio to notion.json"));

  it("captures workflow metadata", () => {
    expect(rep.workflowId).toBe("p30EFIZvfIfVgxCd");
    expect(rep.workflowName).toBe("Audio to notion");
  });

  it("populates every node with the required fields", () => {
    expect(rep.nodes.length).toBeGreaterThan(0);
    for (const n of rep.nodes) {
      expect(typeof n.id).toBe("string");
      expect(typeof n.name).toBe("string");
      expect(typeof n.type).toBe("string");
      expect(typeof n.classification).toBe("string");
      expect(typeof n.isTrivial).toBe("boolean");
      expect(Array.isArray(n.upstreamNodeIds)).toBe(true);
      expect(Array.isArray(n.downstreamNodeIds)).toBe(true);
      expect(Array.isArray(n.failureModes)).toBe(true);
    }
  });

  it("extracts the expected external systems", () => {
    expect(rep.systems).toEqual(["Google Drive", "Notion", "OpenAI"]);
  });

  it("reports no error handling", () => {
    expect(rep.errorHandling.hasErrorWorkflow).toBe(false);
    expect(rep.errorHandling.errorTriggerNodeIds).toEqual([]);
    expect(rep.errorHandling.errorWorkflowId).toBeUndefined();
  });

  it("identifies the trigger node", () => {
    const trigger = nodeByName(rep, "Google Drive Trigger");
    expect(rep.triggerNodeIds).toEqual([trigger.id]);
    expect(trigger.classification).toBe("trigger");
  });

  it("identifies Notion as the destination", () => {
    const notion = nodeByName(rep, "Notion");
    expect(rep.destinationNodeIds).toContain(notion.id);
    expect(notion.classification).toBe("destination");
  });

  it("wires upstream/downstream from the connections graph", () => {
    const trigger = nodeByName(rep, "Google Drive Trigger");
    const gdrive = nodeByName(rep, "Google Drive");
    const openai = nodeByName(rep, "OpenAI");
    expect(gdrive.upstreamNodeIds).toEqual([trigger.id]);
    expect(gdrive.downstreamNodeIds).toEqual([openai.id]);
  });

  it("flags sticky notes as trivial and real action nodes as non-trivial", () => {
    expect(nodeByName(rep, "Sticky Note").isTrivial).toBe(true);
    expect(nodeByName(rep, "Notion").isTrivial).toBe(false);
  });

  it("attaches failure modes for catalog entries and leaves uncatalogued types empty", () => {
    const notion = nodeByName(rep, "Notion");
    const sticky = nodeByName(rep, "Sticky Note");
    expect(notion.failureModes.length).toBeGreaterThan(0);
    expect(notion.failureModes[0].description).toBe("token expiry");
    expect(sticky.failureModes).toEqual([]);
  });
});

describe("parse — error monitoring (schedule + Slack)", () => {
  const rep = parse(
    loadJson(
      "Automated hourly n8n error monitoring with Slack notifications.json",
    ),
  );

  it("identifies the schedule trigger", () => {
    const trigger = nodeByName(rep, "Schedule Trigger");
    expect(rep.triggerNodeIds).toEqual([trigger.id]);
  });

  it("identifies Slack as the (terminal) destination", () => {
    const slack = nodeByName(rep, "Slack");
    expect(rep.destinationNodeIds).toContain(slack.id);
  });

  it("includes Slack in the systems list", () => {
    expect(rep.systems).toContain("Slack");
  });

  it("attaches timezone drift for the schedule trigger via the catalog", () => {
    const trigger = nodeByName(rep, "Schedule Trigger");
    expect(trigger.failureModes.map((f) => f.description)).toEqual([
      "timezone drift",
    ]);
  });
});

describe("parse — HubSpot/Jira support routing (branching)", () => {
  const rep = parse(
    loadJson(
      "Automate support ticket classification & routing from HubSpot to Jira with GPT.json",
    ),
  );

  it("includes both HubSpot and Jira in the systems list", () => {
    expect(rep.systems).toEqual(expect.arrayContaining(["HubSpot", "Jira"]));
  });

  it("identifies multiple triggers", () => {
    const triggerNames = rep.nodes
      .filter((n) => n.classification === "trigger")
      .map((n) => n.name)
      .sort();
    expect(triggerNames).toEqual(
      expect.arrayContaining([
        "For testing",
        "Set the running interval",
        "When Executed by Another Workflow",
      ]),
    );
  });

  it("Router downstream includes both branch heads (Sentinel_agent, Profiler_agent)", () => {
    const router = nodeByName(rep, "Router");
    const sentinel = nodeByName(rep, "Sentinel_agent");
    const profiler = nodeByName(rep, "Profiler_agent");
    expect(router.classification).toBe("conditional");
    expect(router.downstreamNodeIds).toEqual(
      expect.arrayContaining([sentinel.id, profiler.id]),
    );
  });

  it("Jira issue creator is identified as a destination", () => {
    const jira = nodeByName(rep, "Create an issue in Jira");
    expect(rep.destinationNodeIds).toContain(jira.id);
  });
});

describe("parse — synthetic error-handler workflow", () => {
  const workflowJson = {
    id: "wf-1",
    name: "synthetic",
    nodes: [
      {
        id: "n-err",
        name: "Error Trigger",
        type: "n8n-nodes-base.errorTrigger",
        parameters: {},
        position: [0, 0],
      },
      {
        id: "n-slack",
        name: "Notify",
        type: "n8n-nodes-base.slack",
        parameters: {},
        position: [100, 0],
      },
    ],
    connections: {
      "Error Trigger": {
        main: [[{ node: "Notify", type: "main", index: 0 }]],
      },
    },
    settings: { errorWorkflow: "wf-error-99" },
  };

  const rep = parse(workflowJson);

  it("populates errorHandling from both signals", () => {
    expect(rep.errorHandling.hasErrorWorkflow).toBe(true);
    expect(rep.errorHandling.errorWorkflowId).toBe("wf-error-99");
    expect(rep.errorHandling.errorTriggerNodeIds).toEqual(["n-err"]);
  });

  it("classifies the errorTrigger node as error_handler", () => {
    const errNode = rep.nodes.find((n) => n.id === "n-err");
    expect(errNode?.classification).toBe("error_handler");
  });
});
