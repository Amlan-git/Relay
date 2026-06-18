/**
 * Eval scoring — stubbed. Real structural diff + LLM-as-judge lands after the parser
 * and agent are wired up (steps 2-4 in the build plan).
 *
 * The function signature is the contract: (generatedSOP, goldSOP, workflowRepresentation)
 * → structural completeness, hallucination count, inferred-section score.
 */

import type { SOP } from "../lib/agent/types";
import type { WorkflowRepresentation } from "../lib/parser/types";

export type { SOP } from "../lib/agent/types";

export interface SOPScore {
  structuralCompleteness: number;
  hallucinationCount: number;
  inferredSectionScore: number;
}

export function scoreSOP(
  generatedSOP: SOP,
  goldSOP: SOP,
  workflowRepresentation: WorkflowRepresentation,
): SOPScore {
  const nodeNames = workflowRepresentation.nodes.map((n) => n.name);
  const generatedText = [
    generatedSOP.overview,
    generatedSOP.atAGlance,
    generatedSOP.howItWorks,
    generatedSOP.troubleshooting,
  ].join("\n");

  const nodesMentioned = nodeNames.filter((name) =>
    generatedText.toLowerCase().includes(name.toLowerCase()),
  ).length;

  const structuralCompleteness =
    nodeNames.length === 0 ? 0 : nodesMentioned / nodeNames.length;

  const hallucinationCount = 0;

  const goldText = [
    goldSOP.overview,
    goldSOP.atAGlance,
    goldSOP.howItWorks,
    goldSOP.troubleshooting,
  ].join("\n").toLowerCase();
  const generatedLower = generatedText.toLowerCase();
  const goldTokens = new Set(goldText.split(/\W+/).filter((t) => t.length > 3));
  const generatedTokens = new Set(
    generatedLower.split(/\W+/).filter((t) => t.length > 3),
  );
  const overlap = [...goldTokens].filter((t) => generatedTokens.has(t)).length;
  const inferredSectionScore =
    goldTokens.size === 0 ? 0 : overlap / goldTokens.size;

  return {
    structuralCompleteness,
    hallucinationCount,
    inferredSectionScore,
  };
}
