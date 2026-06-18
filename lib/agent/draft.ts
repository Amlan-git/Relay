/**
 * Stage 1 — Draft.
 *
 * Takes a parsed WorkflowRepresentation, serialises it into a safe compact
 * JSON view (no raw n8n shapes, no credentials), substitutes it into the v1
 * draft prompt, and asks Gemini to return a structured four-section SOP.
 *
 * Per the locked Build Plan:
 *   - LLM never sees raw n8n JSON; only this representation.
 *   - v1 prompt is deliberately rough — few-shot and trivial-collapse land in
 *     prompt v2/v3 (step 5).
 */

import { Type, type Schema } from "@google/genai";

import { generateStructured, DRAFT_MODEL } from "../gemini";
import type { WorkflowRepresentation } from "../parser/types";
import { loadPrompt } from "./promptLoader";
import type { SOP } from "./types";

// ---------------------------------------------------------------------------
// summarizeParameters — safe, compact per-node parameter view
// ---------------------------------------------------------------------------

const REDACT_KEYS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /authorization/i,
  /credential/i,
  /bearer/i,
];

const TOKEN_QUERY_PARAMS = /[?&](?:token|key|secret|signature|auth)=/i;

const STRING_MAX = 200;

export function summarizeParameters(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!params || typeof params !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (REDACT_KEYS.some((re) => re.test(key))) {
      out[key] = "[redacted]";
      continue;
    }
    if (value == null) {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (TOKEN_QUERY_PARAMS.test(value)) {
        out[key] = "[redacted-url]";
      } else if (value.length > STRING_MAX) {
        out[key] = value.slice(0, STRING_MAX) + "...";
      } else {
        out[key] = value;
      }
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = `[array length=${value.length}]`;
      continue;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value as Record<string, unknown>);
      out[key] = `[object keys=${keys.length}]`;
      continue;
    }
    out[key] = `[${typeof value}]`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// serializeRepresentation
// ---------------------------------------------------------------------------

interface SerialisedNode {
  id: string;
  name: string;
  type: string;
  classification: string;
  isTrivial: boolean;
  upstreamNodeIds: string[];
  downstreamNodeIds: string[];
  parameterSummary: Record<string, unknown>;
  failureModes: string[];
}

interface SerialisedRepresentation {
  workflowName: string;
  systems: string[];
  triggerNodeIds: string[];
  destinationNodeIds: string[];
  errorHandling: {
    hasErrorWorkflow: boolean;
    errorWorkflowId?: string;
    errorTriggerNodeIds: string[];
  };
  nodes: SerialisedNode[];
}

export function serializeRepresentation(rep: WorkflowRepresentation): string {
  const payload: SerialisedRepresentation = {
    workflowName: rep.workflowName,
    systems: rep.systems,
    triggerNodeIds: rep.triggerNodeIds,
    destinationNodeIds: rep.destinationNodeIds,
    errorHandling: rep.errorHandling,
    nodes: rep.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      classification: n.classification,
      isTrivial: n.isTrivial,
      upstreamNodeIds: n.upstreamNodeIds,
      downstreamNodeIds: n.downstreamNodeIds,
      parameterSummary: summarizeParameters(n.parameters),
      failureModes: n.failureModes.map((f) => f.description),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// Prompt + LLM call
// ---------------------------------------------------------------------------

export function buildDraftPrompt(rep: WorkflowRepresentation): string {
  const template = loadPrompt("draft");
  return template.replace("{{REPRESENTATION}}", serializeRepresentation(rep));
}

const SOP_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING },
    atAGlance: { type: Type.STRING },
    howItWorks: { type: Type.STRING },
    troubleshooting: { type: Type.STRING },
  },
  required: ["overview", "atAGlance", "howItWorks", "troubleshooting"],
  propertyOrdering: ["overview", "atAGlance", "howItWorks", "troubleshooting"],
};

const SYSTEM_INSTRUCTION =
  "You produce client-facing Standard Operating Procedures (SOPs) from parsed n8n workflow representations. Only describe nodes that appear in the input. Never invent nodes, systems, or parameters. Respond with JSON matching the requested schema.";

export async function draftSOP(rep: WorkflowRepresentation): Promise<SOP> {
  const userPrompt = buildDraftPrompt(rep);
  return generateStructured<SOP>({
    model: DRAFT_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    jsonSchema: SOP_SCHEMA,
  });
}
