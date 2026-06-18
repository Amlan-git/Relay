import type { SOP } from "./types";
import type { WorkflowRepresentation, WorkflowNode } from "../parser/types";
import { verifySOP } from "./verify";

function node(
  id: string,
  name: string,
  isTrivial = false,
): WorkflowNode {
  return {
    id,
    name,
    type: `n8n-nodes-base.${name.toLowerCase().replace(/\W+/g, "")}`,
    parameters: {},
    position: [0, 0],
    classification: isTrivial ? "transform" : "action",
    isTrivial,
    upstreamNodeIds: [],
    downstreamNodeIds: [],
    failureModes: [],
  };
}

function rep(nodes: WorkflowNode[]): WorkflowRepresentation {
  return {
    workflowId: "wf-test",
    workflowName: "Test workflow",
    nodes,
    systems: [],
    errorHandling: {
      hasErrorWorkflow: false,
      errorTriggerNodeIds: [],
    },
    triggerNodeIds: [],
    destinationNodeIds: [],
  };
}

function sop(body: Partial<SOP>): SOP {
  return {
    overview: body.overview ?? "",
    atAGlance: body.atAGlance ?? "",
    howItWorks: body.howItWorks ?? "",
    troubleshooting: body.troubleshooting ?? "",
  };
}

describe("verifySOP", () => {
  it("counts significant non-trivial nodes as required coverage", () => {
    const representation = rep([
      node("1", "Webhook Trigger"),
      node("2", "Format Fields", true),
      node("3", "Create Jira Issue"),
    ]);

    const report = verifySOP(
      sop({
        howItWorks:
          "The Webhook Trigger receives the request. Format Fields reshapes the payload.",
      }),
      representation,
    );

    expect(report.coveredNodes).toEqual(["Webhook Trigger"]);
    expect(report.missingNodes).toEqual(["Create Jira Issue"]);
    expect(report.structuralCompleteness).toBe(0.5);
    expect(report.passed).toBe(false);
  });

  it("normalizes node names for matching punctuation and case", () => {
    const representation = rep([
      node("1", "HubSpot: Get Contact"),
      node("2", "Create Jira Issue"),
    ]);

    const report = verifySOP(
      sop({
        howItWorks:
          "First, hubspot get contact finds the requester. Then CREATE JIRA ISSUE opens the task.",
      }),
      representation,
    );

    expect(report.coveredNodes).toEqual([
      "HubSpot: Get Contact",
      "Create Jira Issue",
    ]);
    expect(report.missingNodes).toEqual([]);
    expect(report.structuralCompleteness).toBe(1);
    expect(report.passed).toBe(true);
  });

  it("flags explicit quoted node references that are not in the workflow", () => {
    const representation = rep([
      node("1", "Webhook Trigger"),
      node("2", "Create Jira Issue"),
    ]);

    const report = verifySOP(
      sop({
        howItWorks:
          'The Webhook Trigger starts the workflow, then the "Send Slack Alert" node notifies the team.',
      }),
      representation,
    );

    expect(report.hallucinatedNodes).toEqual(["Send Slack Alert"]);
    expect(report.passed).toBe(false);
    expect(report.summary).toMatch(/hallucinated/i);
  });

  it("passes empty required coverage when a workflow has only trivial nodes", () => {
    const representation = rep([node("1", "Set Fields", true)]);

    const report = verifySOP(
      sop({ howItWorks: "Set Fields prepares the data." }),
      representation,
    );

    expect(report.structuralCompleteness).toBe(1);
    expect(report.missingNodes).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
