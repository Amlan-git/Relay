/**
 * Parser entry. Pure utilities + the parse() composition that produces a fully
 * populated WorkflowRepresentation from raw n8n JSON.
 *
 * Exports:
 *   - detectTrivial(node)                  → boolean
 *   - extractSystems(nodes)                → string[]  (deduped, sorted)
 *   - detectErrorHandling(json, classified) → ErrorHandlerInfo
 *   - parse(workflowJson)                  → WorkflowRepresentation
 */

import { getFailureModes } from "./catalog";
import { classifyNode } from "./classify";
import { traceConnections } from "./trace";
import type {
  ErrorHandlerInfo,
  FailureMode,
  NodeClassification,
  WorkflowNode,
  WorkflowRepresentation,
} from "./types";

interface MinimalNode {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
}

interface ClassifiedNodeInput {
  id: string;
  classification: NodeClassification;
}

const TRIVIAL_TYPES = new Set([
  "n8n-nodes-base.set",
  "n8n-nodes-base.editFields",
  "n8n-nodes-base.stickyNote",
  "n8n-nodes-base.noOp",
]);

export function detectTrivial(node: MinimalNode): boolean {
  return TRIVIAL_TYPES.has(node.type);
}

// ---------------------------------------------------------------------------
// extractSystems
// ---------------------------------------------------------------------------

/**
 * Type suffixes (post-last-dot) that don't represent an external system.
 * Covers the user-specified skip list plus other n8n built-in data/control
 * primitives that would otherwise produce noisy "system" entries.
 */
const NON_SYSTEM_SUFFIXES = new Set([
  // explicit skip list from the spec
  "set",
  "editFields",
  "if",
  "switch",
  "code",
  "stickyNote",
  "splitInBatches",
  "executeWorkflow",
  "manualTrigger",
  "scheduleTrigger",
  "errorTrigger",
  "executeWorkflowTrigger",
  // additional control-flow / pure-data utilities
  "function",
  "functionItem",
  "merge",
  "itemLists",
  "aggregate",
  "filter",
  "noOp",
  "dateTime",
  "wait",
  "splitOut",
  "removeDuplicates",
  "summarize",
  "sort",
  "executeCommand",
  // langchain orchestration constructs (not external systems by themselves)
  "agent",
  "toolWorkflow",
  "chainSummarization",
  "textClassifier",
  "outputParserStructured",
]);

const NAME_OVERRIDES: Record<string, string> = {
  openAi: "OpenAI",
  lmChatOpenAi: "OpenAI",
  hubspot: "HubSpot",
  hubspotTool: "HubSpot",
  github: "GitHub",
  gitlab: "GitLab",
  http: "HTTP",
  httpRequest: "HTTP",
  graphql: "GraphQL",
  postgres: "Postgres",
  mysql: "MySQL",
  mongoDb: "MongoDB",
  awsS3: "AWS S3",
};

function suffixOf(type: string): string {
  const idx = type.lastIndexOf(".");
  return idx >= 0 ? type.slice(idx + 1) : type;
}

function camelCaseToTitle(s: string): string {
  // insert a space before each capital letter that follows a lowercase letter
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .split(" ")
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function suffixToSystemName(suffix: string): string {
  if (NAME_OVERRIDES[suffix]) return NAME_OVERRIDES[suffix];
  // Strip a trailing "Trigger" if the prefix is a known external system —
  // googleDriveTrigger → googleDrive → Google Drive.
  if (suffix.endsWith("Trigger") && suffix !== "Trigger") {
    const base = suffix.slice(0, -"Trigger".length);
    if (NAME_OVERRIDES[base]) return NAME_OVERRIDES[base];
    return camelCaseToTitle(base);
  }
  return camelCaseToTitle(suffix);
}

export function extractSystems(nodes: MinimalNode[]): string[] {
  const set = new Set<string>();
  for (const node of nodes) {
    const suffix = suffixOf(node.type);
    if (NON_SYSTEM_SUFFIXES.has(suffix)) continue;
    // also skip the suffix's "Trigger"-stripped form if that's a non-system
    if (suffix.endsWith("Trigger")) {
      const base = suffix.slice(0, -"Trigger".length);
      if (NON_SYSTEM_SUFFIXES.has(base) || base.length === 0) continue;
    }
    set.add(suffixToSystemName(suffix));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// detectErrorHandling
// ---------------------------------------------------------------------------

function readErrorWorkflowSetting(workflowJson: unknown): string | undefined {
  if (!workflowJson || typeof workflowJson !== "object") return undefined;
  const settings = (workflowJson as { settings?: unknown }).settings;
  if (!settings || typeof settings !== "object") return undefined;
  const id = (settings as { errorWorkflow?: unknown }).errorWorkflow;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export function detectErrorHandling(
  workflowJson: unknown,
  classifiedNodes: ClassifiedNodeInput[],
): ErrorHandlerInfo {
  const errorTriggerNodeIds = classifiedNodes
    .filter((n) => n.classification === "error_handler")
    .map((n) => n.id);

  const errorWorkflowId = readErrorWorkflowSetting(workflowJson);
  const hasErrorWorkflow =
    Boolean(errorWorkflowId) || errorTriggerNodeIds.length > 0;

  const result: ErrorHandlerInfo = {
    hasErrorWorkflow,
    errorTriggerNodeIds,
  };
  if (errorWorkflowId) result.errorWorkflowId = errorWorkflowId;
  return result;
}

// ---------------------------------------------------------------------------
// parse — full WorkflowRepresentation composition
// ---------------------------------------------------------------------------

interface RawN8nNode {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
  position?: [number, number];
}

interface RawN8nWorkflow {
  id?: string;
  name?: string;
  nodes: RawN8nNode[];
  connections?: Record<string, unknown>;
  settings?: { errorWorkflow?: string };
}

function toFailureModes(labels: string[]): FailureMode[] {
  // Catalog v1 returns short string labels. The WorkflowRepresentation requires
  // { category, description } objects; we mirror the label into both for now.
  // Future catalog versions can split the two when needed.
  return labels.map((label) => ({ category: label, description: label }));
}

export function parse(workflowJson: unknown): WorkflowRepresentation {
  if (!workflowJson || typeof workflowJson !== "object") {
    throw new Error("parse: workflowJson must be an object");
  }
  const wf = workflowJson as RawN8nWorkflow;
  const rawNodes = Array.isArray(wf.nodes) ? wf.nodes : [];
  const connections = (wf.connections ?? {}) as Record<string, unknown>;

  // First pass: classification (used by detectErrorHandling and node building).
  const classifications = new Map<string, NodeClassification>();
  for (const n of rawNodes) {
    classifications.set(n.id, classifyNode(n, rawNodes, connections));
  }

  // Topology trace, name → id–keyed map already.
  const trace = traceConnections(rawNodes, connections);

  const nodes: WorkflowNode[] = rawNodes.map((n) => {
    const classification = classifications.get(n.id) ?? "action";
    const edges = trace.get(n.id) ?? { upstream: [], downstream: [] };
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      parameters: n.parameters ?? {},
      position: n.position ?? [0, 0],
      classification,
      isTrivial: detectTrivial(n),
      upstreamNodeIds: edges.upstream,
      downstreamNodeIds: edges.downstream,
      failureModes: toFailureModes(getFailureModes(n.type)),
    };
  });

  const classifiedForErrorHandling = nodes.map((n) => ({
    id: n.id,
    classification: n.classification,
  }));
  const errorHandling: ErrorHandlerInfo = detectErrorHandling(
    workflowJson,
    classifiedForErrorHandling,
  );

  const triggerNodeIds = nodes
    .filter((n) => n.classification === "trigger")
    .map((n) => n.id);
  const destinationNodeIds = nodes
    .filter((n) => n.classification === "destination")
    .map((n) => n.id);

  return {
    workflowId: wf.id ?? "",
    workflowName: wf.name ?? "",
    nodes,
    systems: extractSystems(rawNodes),
    errorHandling,
    triggerNodeIds,
    destinationNodeIds,
  };
}
