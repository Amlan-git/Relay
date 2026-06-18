import { readFileSync } from "node:fs";
import { join } from "node:path";

import { traceConnections } from "./trace";

const WORKFLOWS_DIR = join(__dirname, "..", "..", "eval", "workflows");

interface RawNode {
  id: string;
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
}
interface RawWorkflow {
  nodes: RawNode[];
  connections: Record<string, unknown>;
}

function loadWorkflow(file: string): RawWorkflow {
  return JSON.parse(readFileSync(join(WORKFLOWS_DIR, file), "utf8"));
}
function nodeIdByName(wf: RawWorkflow, name: string): string {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node ${name} not in workflow`);
  return n.id;
}

describe("traceConnections — linear topology (Audio to notion)", () => {
  const wf = loadWorkflow("Audio to notion.json");
  const trace = traceConnections(wf.nodes, wf.connections);

  it("trigger nodes have empty upstream", () => {
    const triggerId = nodeIdByName(wf, "Google Drive Trigger");
    expect(trace.get(triggerId)?.upstream).toEqual([]);
  });

  it("terminal destination has empty downstream (Notion)", () => {
    const notionId = nodeIdByName(wf, "Notion");
    expect(trace.get(notionId)?.downstream).toEqual([]);
  });

  it("middle node has exactly one upstream and one downstream (Google Drive)", () => {
    const gdriveId = nodeIdByName(wf, "Google Drive");
    const triggerId = nodeIdByName(wf, "Google Drive Trigger");
    const openAiId = nodeIdByName(wf, "OpenAI");
    expect(trace.get(gdriveId)?.upstream).toEqual([triggerId]);
    expect(trace.get(gdriveId)?.downstream).toEqual([openAiId]);
  });

  it("disconnected nodes (sticky notes) have empty upstream and downstream", () => {
    const stickyId = nodeIdByName(wf, "Sticky Note");
    expect(trace.get(stickyId)?.upstream).toEqual([]);
    expect(trace.get(stickyId)?.downstream).toEqual([]);
  });

  it("returns an entry for every node", () => {
    for (const n of wf.nodes) {
      expect(trace.has(n.id)).toBe(true);
    }
  });
});

describe("traceConnections — conditional branches (HubSpot Router)", () => {
  const wf = loadWorkflow(
    "Automate support ticket classification & routing from HubSpot to Jira with GPT.json",
  );
  const trace = traceConnections(wf.nodes, wf.connections);

  const routerId = nodeIdByName(wf, "Router");
  const sentinelAgentId = nodeIdByName(wf, "Sentinel_agent");
  const profilerAgentId = nodeIdByName(wf, "Profiler_agent");

  it("conditional node has multiple downstream entries across branches", () => {
    const downstream = trace.get(routerId)?.downstream ?? [];
    expect(downstream).toEqual(
      expect.arrayContaining([sentinelAgentId, profilerAgentId]),
    );
    expect(downstream.length).toBeGreaterThanOrEqual(2);
  });

  it("nodes on different branches do not appear in each other's traces", () => {
    const sentinelTrace = trace.get(sentinelAgentId);
    const profilerTrace = trace.get(profilerAgentId);
    // Profiler is not upstream/downstream of Sentinel
    expect(sentinelTrace?.upstream).not.toContain(profilerAgentId);
    expect(sentinelTrace?.downstream).not.toContain(profilerAgentId);
    // and vice versa
    expect(profilerTrace?.upstream).not.toContain(sentinelAgentId);
    expect(profilerTrace?.downstream).not.toContain(sentinelAgentId);
  });

  it("both branch heads have Router as their (only) upstream from the conditional", () => {
    expect(trace.get(sentinelAgentId)?.upstream).toContain(routerId);
    expect(trace.get(profilerAgentId)?.upstream).toContain(routerId);
  });
});

describe("traceConnections — error connections (synthetic fixture)", () => {
  // None of the real workflows use the `error` output type. Build a small synthetic
  // graph: Schedule -> HTTP --(main)--> Sink, HTTP --(error)--> ErrorHandler.
  const nodes: RawNode[] = [
    {
      id: "n-trigger",
      name: "Schedule",
      type: "n8n-nodes-base.scheduleTrigger",
      parameters: {},
    },
    {
      id: "n-http",
      name: "HTTP",
      type: "n8n-nodes-base.httpRequest",
      parameters: {},
    },
    {
      id: "n-sink",
      name: "Sink",
      type: "n8n-nodes-base.noOp",
      parameters: {},
    },
    {
      id: "n-error",
      name: "ErrorHandler",
      type: "n8n-nodes-base.slack",
      parameters: {},
    },
  ];
  const connections = {
    Schedule: {
      main: [[{ node: "HTTP", type: "main", index: 0 }]],
    },
    HTTP: {
      main: [[{ node: "Sink", type: "main", index: 0 }]],
      error: [[{ node: "ErrorHandler", type: "main", index: 0 }]],
    },
  };

  const trace = traceConnections(nodes, connections);

  it("error-output target appears as downstream of the source", () => {
    expect(trace.get("n-http")?.downstream).toEqual(
      expect.arrayContaining(["n-sink", "n-error"]),
    );
  });

  it("error-handler node lists the source as upstream", () => {
    expect(trace.get("n-error")?.upstream).toEqual(["n-http"]);
  });

  it("error-handler node has empty downstream when not connected onward", () => {
    expect(trace.get("n-error")?.downstream).toEqual([]);
  });
});
