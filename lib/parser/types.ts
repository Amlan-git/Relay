/**
 * WorkflowRepresentation — the structured object every downstream stage reasons over.
 * The LLM never sees raw n8n JSON; only this representation.
 *
 * Stage 0 (parser) produces this. Stage 1 (draft) and Stage 2 (verify) consume it.
 *
 * This file is the stub from Step 1 of the build sequence. Implementation lands in Step 2.
 */

export type NodeClassification =
  | "trigger"
  | "transform"
  | "action"
  | "conditional"
  | "destination"
  | "error_handler";

export interface FailureMode {
  category: string;
  description: string;
}

export interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  position: [number, number];
  classification: NodeClassification;
  isTrivial: boolean;
  upstreamNodeIds: string[];
  downstreamNodeIds: string[];
  failureModes: FailureMode[];
}

export interface ErrorHandlerInfo {
  hasErrorWorkflow: boolean;
  errorWorkflowId?: string;
  errorTriggerNodeIds: string[];
}

export interface WorkflowRepresentation {
  workflowId: string;
  workflowName: string;
  nodes: WorkflowNode[];
  systems: string[];
  errorHandling: ErrorHandlerInfo;
  triggerNodeIds: string[];
  destinationNodeIds: string[];
}
