/**
 * Failure-mode catalog v1 — static, hand-curated. Keyed by n8n node type.
 *
 * Drives the Troubleshooting section's "common issues" claims downstream.
 * Restricted to known patterns (rate limits, OAuth token expiry, idempotency,
 * etc.) so inferred claims stay grounded in a fixed vocabulary rather than
 * free-form LLM speculation.
 */

const EXPLICIT: Record<string, string[]> = {
  "n8n-nodes-base.httpRequest": ["rate limits", "auth failures"],
  "n8n-nodes-base.stripe": ["idempotency keys"],
  "n8n-nodes-base.webhook": ["signature validation"],
  "n8n-nodes-base.scheduleTrigger": ["timezone drift"],
};

// Types that talk to OAuth-protected APIs. Token expiry is the dominant
// real-world failure mode for these.
const OAUTH_PRONE = new Set([
  "n8n-nodes-base.googleDrive",
  "n8n-nodes-base.googleDriveTrigger",
  "n8n-nodes-base.googleSheets",
  "n8n-nodes-base.googleSheetsTrigger",
  "n8n-nodes-base.googleCalendar",
  "n8n-nodes-base.googleDocs",
  "n8n-nodes-base.gmail",
  "n8n-nodes-base.gmailTrigger",
  "n8n-nodes-base.notion",
  "n8n-nodes-base.notionTrigger",
  "n8n-nodes-base.slack",
  "n8n-nodes-base.slackTrigger",
  "n8n-nodes-base.hubspot",
  "n8n-nodes-base.hubspotTrigger",
  "n8n-nodes-base.hubspotTool",
  "n8n-nodes-base.jira",
  "n8n-nodes-base.jiraTrigger",
  "n8n-nodes-base.github",
  "n8n-nodes-base.gitlab",
  "n8n-nodes-base.dropbox",
  "n8n-nodes-base.microsoftTeams",
  "n8n-nodes-base.microsoftOutlook",
  "n8n-nodes-base.salesforce",
  "n8n-nodes-base.zoom",
  "n8n-nodes-base.airtable",
]);

export function getFailureModes(nodeType: string): string[] {
  if (EXPLICIT[nodeType]) return [...EXPLICIT[nodeType]];
  if (OAUTH_PRONE.has(nodeType)) return ["token expiry"];
  return [];
}
