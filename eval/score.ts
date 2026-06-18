import type { SOP } from "../lib/agent/types";
import { verifySOP, type VerificationReport } from "../lib/agent/verify";
import type { WorkflowRepresentation } from "../lib/parser/types";

export type { SOP } from "../lib/agent/types";

export interface SOPScore extends VerificationReport {
  structuralCompleteness: number;
  hallucinationCount: number;
  inferredSectionScore: number;
}

export function scoreSOP(
  generatedSOP: SOP,
  goldSOP: SOP,
  workflowRepresentation: WorkflowRepresentation,
): SOPScore {
  const verification = verifySOP(generatedSOP, workflowRepresentation);
  const generatedText = [
    generatedSOP.overview,
    generatedSOP.atAGlance,
    generatedSOP.howItWorks,
    generatedSOP.troubleshooting,
  ].join("\n");

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
    ...verification,
    hallucinationCount: verification.hallucinatedNodes.length,
    inferredSectionScore,
  };
}
