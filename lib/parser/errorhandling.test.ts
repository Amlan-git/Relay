import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectErrorHandling } from "./index";
import type { NodeClassification } from "./types";

const WORKFLOWS_DIR = join(__dirname, "..", "..", "eval", "workflows");

interface ClassifiedNode {
  id: string;
  classification: NodeClassification;
}

describe("detectErrorHandling", () => {
  it("returns empty result for a workflow with no error handling", () => {
    const workflowJson = JSON.parse(
      readFileSync(join(WORKFLOWS_DIR, "Audio to notion.json"), "utf8"),
    );
    const classified: ClassifiedNode[] = workflowJson.nodes.map(
      (n: { id: string }) => ({
        id: n.id,
        classification: "action" as NodeClassification,
      }),
    );
    const result = detectErrorHandling(workflowJson, classified);
    expect(result.hasErrorWorkflow).toBe(false);
    expect(result.errorWorkflowId).toBeUndefined();
    expect(result.errorTriggerNodeIds).toEqual([]);
  });

  it("captures errorTrigger-classified node IDs and reports hasErrorWorkflow=true", () => {
    const workflowJson = {
      nodes: [
        { id: "n-err", name: "Error Trigger" },
        { id: "n-slack", name: "Slack" },
      ],
      connections: {},
    };
    const classified: ClassifiedNode[] = [
      { id: "n-err", classification: "error_handler" },
      { id: "n-slack", classification: "destination" },
    ];
    const result = detectErrorHandling(workflowJson, classified);
    expect(result.hasErrorWorkflow).toBe(true);
    expect(result.errorTriggerNodeIds).toEqual(["n-err"]);
    expect(result.errorWorkflowId).toBeUndefined();
  });

  it("captures workflow.settings.errorWorkflow id and reports hasErrorWorkflow=true", () => {
    const workflowJson = {
      nodes: [{ id: "n1", name: "Schedule" }],
      connections: {},
      settings: { errorWorkflow: "wf-error-123" },
    };
    const classified: ClassifiedNode[] = [
      { id: "n1", classification: "trigger" },
    ];
    const result = detectErrorHandling(workflowJson, classified);
    expect(result.hasErrorWorkflow).toBe(true);
    expect(result.errorWorkflowId).toBe("wf-error-123");
    expect(result.errorTriggerNodeIds).toEqual([]);
  });

  it("captures both signals when both are present", () => {
    const workflowJson = {
      nodes: [
        { id: "n-err", name: "Error Trigger" },
        { id: "n-slack", name: "Slack" },
      ],
      connections: {},
      settings: { errorWorkflow: "wf-error-999" },
    };
    const classified: ClassifiedNode[] = [
      { id: "n-err", classification: "error_handler" },
      { id: "n-slack", classification: "destination" },
    ];
    const result = detectErrorHandling(workflowJson, classified);
    expect(result.hasErrorWorkflow).toBe(true);
    expect(result.errorWorkflowId).toBe("wf-error-999");
    expect(result.errorTriggerNodeIds).toEqual(["n-err"]);
  });

  it("returns multiple errorTriggerNodeIds in node order", () => {
    const workflowJson = { nodes: [], connections: {} };
    const classified: ClassifiedNode[] = [
      { id: "a", classification: "trigger" },
      { id: "b", classification: "error_handler" },
      { id: "c", classification: "action" },
      { id: "d", classification: "error_handler" },
    ];
    const result = detectErrorHandling(workflowJson, classified);
    expect(result.errorTriggerNodeIds).toEqual(["b", "d"]);
  });
});
