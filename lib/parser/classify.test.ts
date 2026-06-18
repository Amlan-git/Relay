import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyNode } from "./classify";

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
function nodeByName(wf: RawWorkflow, name: string): RawNode {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`node ${name} not in workflow`);
  return n;
}

describe("classifyNode — triggers", () => {
  const audio = loadWorkflow("Audio to notion.json");
  const errorMon = loadWorkflow(
    "Automated hourly n8n error monitoring with Slack notifications.json",
  );
  const hubspot = loadWorkflow(
    "Automate support ticket classification & routing from HubSpot to Jira with GPT.json",
  );

  it("classifies *Trigger node types as trigger (Google Drive Trigger)", () => {
    const n = nodeByName(audio, "Google Drive Trigger");
    expect(classifyNode(n, audio.nodes, audio.connections)).toBe("trigger");
  });

  it("classifies scheduleTrigger as trigger", () => {
    const n = nodeByName(errorMon, "Schedule Trigger");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "trigger",
    );
  });

  it("classifies executeWorkflowTrigger as trigger", () => {
    const n = nodeByName(hubspot, "When Executed by Another Workflow");
    expect(classifyNode(n, hubspot.nodes, hubspot.connections)).toBe("trigger");
  });

  it("classifies manualTrigger as trigger", () => {
    const n = nodeByName(hubspot, "For testing");
    expect(classifyNode(n, hubspot.nodes, hubspot.connections)).toBe("trigger");
  });

  it("classifies webhook node as trigger", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "Webhook", type: "n8n-nodes-base.webhook" },
    ];
    expect(classifyNode(nodes[0], nodes, {})).toBe("trigger");
  });
});

describe("classifyNode — conditionals", () => {
  const hubspot = loadWorkflow(
    "Automate support ticket classification & routing from HubSpot to Jira with GPT.json",
  );

  it("classifies switch as conditional", () => {
    const n = nodeByName(hubspot, "Router");
    expect(classifyNode(n, hubspot.nodes, hubspot.connections)).toBe(
      "conditional",
    );
  });

  it("classifies if as conditional", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "If", type: "n8n-nodes-base.if" },
    ];
    expect(classifyNode(nodes[0], nodes, {})).toBe("conditional");
  });
});

describe("classifyNode — transforms", () => {
  const errorMon = loadWorkflow(
    "Automated hourly n8n error monitoring with Slack notifications.json",
  );

  it("classifies set as transform (Config)", () => {
    const n = nodeByName(errorMon, "Config");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "transform",
    );
  });

  it("classifies code as transform (MakeMessage)", () => {
    const n = nodeByName(errorMon, "MakeMessage");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "transform",
    );
  });

  it("classifies splitInBatches as transform (Loop)", () => {
    const n = nodeByName(errorMon, "Loop");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "transform",
    );
  });

  it("classifies stickyNote as transform", () => {
    const n = nodeByName(errorMon, "Sticky Note");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "transform",
    );
  });
});

describe("classifyNode — destinations", () => {
  const audio = loadWorkflow("Audio to notion.json");
  const errorMon = loadWorkflow(
    "Automated hourly n8n error monitoring with Slack notifications.json",
  );
  const hubspot = loadWorkflow(
    "Automate support ticket classification & routing from HubSpot to Jira with GPT.json",
  );

  it("classifies terminal external node as destination (Notion in audio)", () => {
    const n = nodeByName(audio, "Notion");
    expect(classifyNode(n, audio.nodes, audio.connections)).toBe("destination");
  });

  it("classifies terminal Slack as destination", () => {
    const n = nodeByName(errorMon, "Slack");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "destination",
    );
  });

  it("classifies terminal Jira as destination", () => {
    const n = nodeByName(hubspot, "Create an issue in Jira");
    expect(classifyNode(n, hubspot.nodes, hubspot.connections)).toBe(
      "destination",
    );
  });
});

describe("classifyNode — actions", () => {
  const audio = loadWorkflow("Audio to notion.json");
  const errorMon = loadWorkflow(
    "Automated hourly n8n error monitoring with Slack notifications.json",
  );

  it("classifies non-terminal external system as action (Google Drive)", () => {
    const n = nodeByName(audio, "Google Drive");
    expect(classifyNode(n, audio.nodes, audio.connections)).toBe("action");
  });

  it("classifies non-terminal OpenAI as action", () => {
    const n = nodeByName(audio, "OpenAI");
    expect(classifyNode(n, audio.nodes, audio.connections)).toBe("action");
  });

  it("classifies non-terminal n8n API call as action", () => {
    const n = nodeByName(errorMon, "GetWorkflows");
    expect(classifyNode(n, errorMon.nodes, errorMon.connections)).toBe(
      "action",
    );
  });
});

describe("classifyNode — error_handler", () => {
  it("classifies errorTrigger node as error_handler", () => {
    const nodes: RawNode[] = [
      { id: "1", name: "Error Trigger", type: "n8n-nodes-base.errorTrigger" },
      { id: "2", name: "Slack", type: "n8n-nodes-base.slack" },
    ];
    const connections = {
      "Error Trigger": {
        main: [[{ node: "Slack", type: "main", index: 0 }]],
      },
    };
    expect(classifyNode(nodes[0], nodes, connections)).toBe("error_handler");
  });

  it("classifies node referenced in errorWorkflow as error_handler", () => {
    const nodes: RawNode[] = [
      {
        id: "1",
        name: "Schedule",
        type: "n8n-nodes-base.scheduleTrigger",
        parameters: {},
      },
      {
        id: "2",
        name: "Slack Notify",
        type: "n8n-nodes-base.slack",
        parameters: { errorWorkflow: "some-error-wf-id" },
      },
    ];
    expect(classifyNode(nodes[1], nodes, {})).toBe("error_handler");
  });
});
