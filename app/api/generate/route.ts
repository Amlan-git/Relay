import { NextResponse } from "next/server";

import { draftSOP } from "../../../lib/agent/draft";
import { verifySOP } from "../../../lib/agent/verify";
import { publishSOP } from "../../../lib/notion/publish";
import { parse } from "../../../lib/parser";

export const maxDuration = 60;

async function workflowFromRequest(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) {
      return JSON.parse(await file.text());
    }
    const json = form.get("json");
    if (typeof json === "string") {
      return JSON.parse(json);
    }
    throw new Error("Upload a .json file or paste workflow JSON.");
  }

  const body = await request.json();
  if (typeof body === "string") {
    return JSON.parse(body);
  }
  if (typeof body?.workflowJson === "string") {
    return JSON.parse(body.workflowJson);
  }
  if (body?.workflowJson && typeof body.workflowJson === "object") {
    return body.workflowJson;
  }
  return body;
}

export async function POST(request: Request) {
  try {
    const workflowJson = await workflowFromRequest(request);
    const representation = parse(workflowJson);
    const sop = await draftSOP(representation);
    const verification = verifySOP(sop, representation);

    let notionUrl: string | undefined;
    let publishWarning: string | undefined;
    const hasNotionEnv =
      Boolean(process.env.NOTION_INTEGRATION_TOKEN) &&
      Boolean(process.env.NOTION_DRAFTS_PAGE_ID);

    if (hasNotionEnv) {
      try {
        const result = await publishSOP(
          sop,
          representation.workflowName || "Untitled workflow",
          verification.summary,
        );
        notionUrl = result.url;
      } catch (err) {
        publishWarning =
          err instanceof Error ? err.message : "Notion publish failed.";
      }
    } else {
      publishWarning =
        "Notion publish skipped: NOTION_INTEGRATION_TOKEN and NOTION_DRAFTS_PAGE_ID are not both set.";
    }

    return NextResponse.json({
      workflowName: representation.workflowName,
      sop,
      verification,
      notionUrl,
      publishWarning,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate SOP.";
    return NextResponse.json({ error: "generation_failed", message }, { status: 400 });
  }
}
