/**
 * Stage 3 — Notion publisher.
 *
 * publishSOP creates a page under NOTION_DRAFTS_PAGE_ID with the SOP
 * rendered as Notion blocks, and returns the resulting page URL.
 *
 * v1 is single synchronous publish — no retry, no queue. Block count for
 * our SOPs is well under Notion's 100-children limit per create call.
 */

import { Client } from "@notionhq/client";

import type { SOP } from "../agent/types";
import { sopToBlocks } from "./blocks";

export interface PublishResult {
  pageId: string;
  url: string;
}

export async function publishSOP(
  sop: SOP,
  workflowName: string,
  verificationSummary?: string,
): Promise<PublishResult> {
  const token = process.env.NOTION_INTEGRATION_TOKEN;
  const parentId = process.env.NOTION_DRAFTS_PAGE_ID;
  if (!token) throw new Error("NOTION_INTEGRATION_TOKEN is not set");
  if (!parentId) throw new Error("NOTION_DRAFTS_PAGE_ID is not set");

  const notion = new Client({ auth: token });
  const blocks = sopToBlocks(sop, { verificationSummary });
  const title = `${workflowName} — SOP`;

  const page = await notion.pages.create({
    parent: { type: "page_id", page_id: parentId },
    properties: {
      title: {
        title: [{ type: "text", text: { content: title } }],
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children: blocks as any,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const url = (page as any).url as string;
  return { pageId: page.id, url };
}
