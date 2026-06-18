import { getFailureModes } from "./catalog";

describe("getFailureModes — explicit entries", () => {
  it("returns rate limits + auth failures for HTTP requests", () => {
    expect(getFailureModes("n8n-nodes-base.httpRequest")).toEqual([
      "rate limits",
      "auth failures",
    ]);
  });

  it("returns idempotency keys for Stripe", () => {
    expect(getFailureModes("n8n-nodes-base.stripe")).toEqual([
      "idempotency keys",
    ]);
  });

  it("returns signature validation for webhooks", () => {
    expect(getFailureModes("n8n-nodes-base.webhook")).toEqual([
      "signature validation",
    ]);
  });

  it("returns timezone drift for the schedule trigger", () => {
    expect(getFailureModes("n8n-nodes-base.scheduleTrigger")).toEqual([
      "timezone drift",
    ]);
  });
});

describe("getFailureModes — OAuth-prone systems", () => {
  it.each([
    "n8n-nodes-base.googleDrive",
    "n8n-nodes-base.googleDriveTrigger",
    "n8n-nodes-base.notion",
    "n8n-nodes-base.slack",
    "n8n-nodes-base.gmail",
    "n8n-nodes-base.hubspot",
    "n8n-nodes-base.jira",
  ])("includes token expiry for %s", (type) => {
    expect(getFailureModes(type)).toContain("token expiry");
  });
});

describe("getFailureModes — unknown types", () => {
  it("returns [] for unknown node types", () => {
    expect(getFailureModes("n8n-nodes-base.set")).toEqual([]);
    expect(getFailureModes("n8n-nodes-base.code")).toEqual([]);
    expect(getFailureModes("n8n-nodes-base.unknownNeverHeardOfIt")).toEqual([]);
  });
});
