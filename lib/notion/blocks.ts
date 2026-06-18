/**
 * SOP -> Notion blocks.
 *
 * Each of the four SOP sections is rendered as an h2 heading followed by
 * blocks parsed from the section's markdown-ish string content:
 *   - lines starting with "- ", "* ", or "• "     -> bulleted_list_item
 *   - lines starting with "<n>. " or "<n>) "       -> numbered_list_item
 *   - lines starting with "### "                   -> heading_3
 *   - blank lines                                  -> skipped
 *   - everything else                              -> paragraph
 *
 * Inline "**bold**" is split into rich_text runs with the bold annotation.
 *
 * v1 renders At a Glance as paragraphs/lists rather than a Notion table —
 * the SOP draft writes it as free-form prose, so a real table is fragile.
 */

import type { SOP } from "../agent/types";

type RichText = {
  type: "text";
  text: { content: string };
  annotations?: { bold?: boolean };
};

type Block = Record<string, unknown>;

const NOTION_TEXT_MAX = 1900; // Notion hard limit is 2000; leave headroom.

function chunkString(s: string, max = NOTION_TEXT_MAX): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out;
}

function richText(content: string): RichText[] {
  if (!content) return [{ type: "text", text: { content: "" } }];
  // Split on **bold** segments.
  const parts = content.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  const runs: RichText[] = [];
  for (const part of parts) {
    const isBold = /^\*\*[^*]+\*\*$/.test(part);
    const text = isBold ? part.slice(2, -2) : part;
    for (const chunk of chunkString(text)) {
      runs.push({
        type: "text",
        text: { content: chunk },
        ...(isBold ? { annotations: { bold: true } } : {}),
      });
    }
  }
  return runs;
}

function paragraph(text: string): Block {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: richText(text) },
  };
}

function heading2(text: string): Block {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: richText(text) },
  };
}

function heading3(text: string): Block {
  return {
    object: "block",
    type: "heading_3",
    heading_3: { rich_text: richText(text) },
  };
}

function bullet(text: string): Block {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText(text) },
  };
}

function numbered(text: string): Block {
  return {
    object: "block",
    type: "numbered_list_item",
    numbered_list_item: { rich_text: richText(text) },
  };
}

function divider(): Block {
  return { object: "block", type: "divider", divider: {} };
}

function sectionToBlocks(title: string, body: string): Block[] {
  const blocks: Block[] = [heading2(title)];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const bulletMatch = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      blocks.push(bullet(bulletMatch[1]));
      continue;
    }
    const numberedMatch = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (numberedMatch) {
      blocks.push(numbered(numberedMatch[1]));
      continue;
    }
    const h3Match = /^###\s+(.*)$/.exec(line);
    if (h3Match) {
      blocks.push(heading3(h3Match[1]));
      continue;
    }
    blocks.push(paragraph(line.trim()));
  }
  return blocks;
}

export function sopToBlocks(
  sop: SOP,
  opts?: { verificationSummary?: string },
): Block[] {
  const blocks: Block[] = [];
  if (opts?.verificationSummary) {
    blocks.push(paragraph(opts.verificationSummary));
    blocks.push(divider());
  }
  blocks.push(...sectionToBlocks("Overview", sop.overview));
  blocks.push(...sectionToBlocks("At a Glance", sop.atAGlance));
  blocks.push(...sectionToBlocks("How It Works", sop.howItWorks));
  blocks.push(...sectionToBlocks("Troubleshooting", sop.troubleshooting));
  return blocks;
}
