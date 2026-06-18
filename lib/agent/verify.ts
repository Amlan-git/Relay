import type { SOP } from "./types";
import type { WorkflowRepresentation } from "../parser/types";

export interface VerificationReport {
  structuralCompleteness: number;
  coveredNodes: string[];
  missingNodes: string[];
  hallucinatedNodes: string[];
  passed: boolean;
  summary: string;
}

function sopText(sop: SOP): string {
  return [
    sop.overview,
    sop.atAGlance,
    sop.howItWorks,
    sop.troubleshooting,
  ].join("\n");
}

export function normalizeNodeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsNormalizedName(text: string, nodeName: string): boolean {
  const normalizedText = ` ${normalizeNodeName(text)} `;
  const normalizedName = normalizeNodeName(nodeName);
  if (!normalizedName) return false;
  return normalizedText.includes(` ${normalizedName} `);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function extractExplicitNodeReferences(text: string): string[] {
  const refs: string[] = [];
  const patterns = [
    /["'`]([^"'`\n]{2,100})["'`]/g,
    /\*\*([^*\n]{2,100})\*\*/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const candidate = match[1].trim();
      const before = text.slice(Math.max(0, match.index - 30), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 30);
      if (/\bnode\b/i.test(`${before} ${after}`)) {
        refs.push(candidate);
      }
    }
  }

  return unique(refs);
}

export function verifySOP(
  sop: SOP,
  representation: WorkflowRepresentation,
): VerificationReport {
  const text = sopText(sop);
  const significantNodes = representation.nodes.filter((node) => !node.isTrivial);
  const sourceNodeNames = representation.nodes.map((node) => node.name);
  const normalizedSourceNames = new Set(
    sourceNodeNames.map((name) => normalizeNodeName(name)),
  );

  const coveredNodes = significantNodes
    .filter((node) => containsNormalizedName(text, node.name))
    .map((node) => node.name);

  const missingNodes = significantNodes
    .filter((node) => !coveredNodes.includes(node.name))
    .map((node) => node.name);

  const hallucinatedNodes = extractExplicitNodeReferences(text).filter(
    (name) => !normalizedSourceNames.has(normalizeNodeName(name)),
  );

  const requiredCount = significantNodes.length;
  const structuralCompleteness =
    requiredCount === 0 ? 1 : coveredNodes.length / requiredCount;
  const passed =
    hallucinatedNodes.length === 0 && structuralCompleteness >= 0.9;

  const summary = passed
    ? `Passed verification: ${(structuralCompleteness * 100).toFixed(1)}% significant-node coverage and no explicit hallucinated node references.`
    : `Needs review: ${(structuralCompleteness * 100).toFixed(1)}% significant-node coverage, ${missingNodes.length} missing node(s), ${hallucinatedNodes.length} hallucinated node reference(s).`;

  return {
    structuralCompleteness,
    coveredNodes,
    missingNodes,
    hallucinatedNodes,
    passed,
    summary,
  };
}
