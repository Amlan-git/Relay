/**
 * Node classification — pure topology + type-table logic, no LLM.
 *
 * Priority order (first match wins):
 *   1. error_handler  — errorTrigger type OR has errorWorkflow parameter
 *   2. trigger        — *Trigger suffix, webhook, scheduleTrigger, manualTrigger
 *   3. conditional    — if, switch
 *   4. transform      — set / editFields / code / aggregate / splitInBatches / etc., or stickyNote
 *   5. destination    — node has no downstream connections (terminal in the graph)
 *   6. action         — default for nodes with external side effects
 */

import type { NodeClassification } from "./types";

export interface ClassifyNode {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
}

export interface ConnectionTarget {
  node: string;
  type: string;
  index: number;
}

// connections shape: { [sourceName]: { [outputType]: Array<Array<ConnectionTarget>> } }
// Accept the loose `unknown` shape because the JSON is untrusted at the parser boundary;
// we narrow inside hasDownstream.
export type Connections = Record<string, unknown>;

const TRANSFORM_TYPES = new Set([
  "n8n-nodes-base.set",
  "n8n-nodes-base.editFields",
  "n8n-nodes-base.code",
  "n8n-nodes-base.function",
  "n8n-nodes-base.functionItem",
  "n8n-nodes-base.aggregate",
  "n8n-nodes-base.splitInBatches",
  "n8n-nodes-base.merge",
  "n8n-nodes-base.itemLists",
  "n8n-nodes-base.filter",
  "n8n-nodes-base.dateTime",
  "n8n-nodes-base.noOp",
  "n8n-nodes-base.stickyNote",
]);

const CONDITIONAL_TYPES = new Set([
  "n8n-nodes-base.if",
  "n8n-nodes-base.switch",
]);

function isTriggerType(type: string): boolean {
  if (type === "n8n-nodes-base.webhook") return true;
  // matches anything ending in "Trigger" — googleDriveTrigger, scheduleTrigger,
  // manualTrigger, executeWorkflowTrigger, errorTrigger, etc.
  return /Trigger$/.test(type);
}

function isErrorHandlerType(type: string): boolean {
  return /errorTrigger$/i.test(type);
}

function hasErrorWorkflowRef(node: ClassifyNode): boolean {
  const params = node.parameters;
  if (!params) return false;
  return typeof params.errorWorkflow === "string" && params.errorWorkflow.length > 0;
}

function hasDownstream(nodeName: string, connections: Connections): boolean {
  const outputs = connections[nodeName];
  if (!outputs || typeof outputs !== "object") return false;
  for (const branchArray of Object.values(outputs as Record<string, unknown>)) {
    if (!Array.isArray(branchArray)) continue;
    for (const branch of branchArray) {
      if (Array.isArray(branch) && branch.length > 0) return true;
    }
  }
  return false;
}

export function classifyNode(
  node: ClassifyNode,
  _allNodes: ClassifyNode[],
  connections: Connections,
): NodeClassification {
  if (isErrorHandlerType(node.type) || hasErrorWorkflowRef(node)) {
    return "error_handler";
  }
  if (isTriggerType(node.type)) {
    return "trigger";
  }
  if (CONDITIONAL_TYPES.has(node.type)) {
    return "conditional";
  }
  if (TRANSFORM_TYPES.has(node.type)) {
    return "transform";
  }
  if (!hasDownstream(node.name, connections)) {
    return "destination";
  }
  return "action";
}
