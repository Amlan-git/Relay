/**
 * Shared agent types — the SOP shape produced by Stage 1 (draft) and
 * consumed by Stage 2 (verify) and the eval scorer.
 *
 * The four sections mirror the PRD's deliverable spec exactly.
 */

export interface SOP {
  overview: string;
  atAGlance: string;
  howItWorks: string;
  troubleshooting: string;
}
