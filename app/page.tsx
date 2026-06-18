"use client";

import { ChangeEvent, FormEvent, useState } from "react";

interface SOP {
  overview: string;
  atAGlance: string;
  howItWorks: string;
  troubleshooting: string;
}

interface VerificationReport {
  structuralCompleteness: number;
  coveredNodes: string[];
  missingNodes: string[];
  hallucinatedNodes: string[];
  passed: boolean;
  summary: string;
}

interface GenerateResponse {
  workflowName: string;
  sop: SOP;
  verification: VerificationReport;
  notionUrl?: string;
  publishWarning?: string;
}

const sampleHint = `Paste exported n8n workflow JSON here, or upload a .json file.`;

export default function Home() {
  const [jsonText, setJsonText] = useState("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setJsonText(await file.text());
    setResult(null);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowJson: jsonText }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Relay could not generate the SOP.");
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <nav className="topbar" aria-label="Relay">
        <div className="brand">
          <span className="brandMark">R</span>
          <span>Relay</span>
        </div>
      </nav>

      <section className="intro">
        <div>
          <h1>Turn n8n workflows into verified client SOPs.</h1>
          <p className="lede">
            Upload a workflow export and Relay drafts a polished handoff document,
            checks structural coverage, and publishes to Notion when configured.
          </p>
        </div>
        <div className="heroPanel" aria-label="Relay pipeline">
          <p className="eyebrow">Pipeline</p>
          <div className="heroStat">
            <span>Input</span>
            <strong>n8n JSON</strong>
          </div>
          <div className="heroFlow">Parser -&gt; Draft -&gt; Verify</div>
          <div className="heroStat">
            <span>Output</span>
            <strong>Client SOP</strong>
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="Relay generator">
        <form className="panel" onSubmit={onSubmit}>
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Source workflow</p>
              <h2>Upload or paste JSON</h2>
            </div>
            {/* TODO: Replace Ready/Idle with Parsing/Drafting/Verifying/Publishing/Done when stage-aware pipeline state exists. */}
            <span className={jsonText.trim() ? "statusPill ready" : "statusPill"}>
              {jsonText.trim() ? "Ready" : "Idle"}
            </span>
          </div>

          <textarea
            aria-label="n8n workflow JSON"
            className={result ? "jsonInput jsonInputDone" : "jsonInput"}
            placeholder={sampleHint}
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
          />

          <div className="toolbar">
            <label className="fileButton">
              Upload .json
              <input accept=".json,application/json" type="file" onChange={onFileChange} />
            </label>
            <button disabled={loading || jsonText.trim().length === 0} type="submit">
              {loading ? "Generating..." : "Generate SOP"}
            </button>
          </div>
        </form>

        <aside className="sidePanel" aria-label="What Relay creates">
          <p className="eyebrow">Deliverable</p>
          <h2>Ready for client review</h2>
          <p className="eyebrow sopStructureLabel">SOP structure</p>
          <div className="deliverableList">
            <span>Overview</span>
            <span>At a Glance</span>
            <span>How It Works</span>
            <span>Troubleshooting</span>
          </div>
          <p>
            Relay grounds each SOP in the parsed workflow so consultants can
            review the page instead of reconstructing the automation by hand.
          </p>
        </aside>
      </section>

      {error ? <div className="error">{error}</div> : null}

      {result ? (
        <section className="results">
          <div className="resultHead">
            <div>
              <p className="eyebrow">Generated SOP</p>
              <h2>{result.workflowName || "Untitled workflow"}</h2>
            </div>
          </div>

          <VerificationCard report={result.verification} warning={result.publishWarning} />

          <SOPSection title="Overview" body={result.sop.overview} />
          <SOPSection title="At a Glance" body={result.sop.atAGlance} />
          <SOPSection title="How It Works" body={result.sop.howItWorks} />
          <SOPSection title="Troubleshooting" body={result.sop.troubleshooting} />

          {result.notionUrl ? (
            <div className="notionAction">
              <a href={result.notionUrl} rel="noreferrer" target="_blank">
                Open in Notion
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      <style jsx>{`
        :global(body) {
          margin: 0;
          background: #eef3f0;
        }
        .shell {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 20px 72px;
          color: #17201b;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 34px;
          padding: 12px 14px;
          border: 1px solid rgba(24, 38, 31, 0.1);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: blur(12px);
          box-shadow: 0 20px 50px rgba(24, 38, 31, 0.06);
        }
        .brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          font-weight: 800;
        }
        .brandMark {
          display: inline-grid;
          width: 32px;
          height: 32px;
          place-items: center;
          border-radius: 8px;
          background: #17201b;
          color: #ffffff;
          font-size: 15px;
          font-weight: 800;
        }
        .intro {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 28px;
          align-items: end;
          margin-bottom: 26px;
        }
        .eyebrow {
          margin: 0 0 8px;
          color: #5b7568;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
          text-transform: uppercase;
        }
        h1 {
          max-width: 780px;
          margin: 0;
          font-size: 56px;
          line-height: 1;
          letter-spacing: 0;
        }
        .lede {
          max-width: 720px;
          margin: 18px 0 0;
          color: #51605a;
          font-size: 18px;
          line-height: 1.55;
        }
        .heroPanel {
          border: 1px solid rgba(23, 32, 27, 0.1);
          border-radius: 14px;
          padding: 18px;
          background: #ffffff;
          box-shadow: 0 24px 70px rgba(24, 38, 31, 0.09);
        }
        .heroStat {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .heroStat span {
          color: #6b7d75;
          font-size: 13px;
          font-weight: 700;
        }
        .heroStat strong {
          font-size: 18px;
          letter-spacing: 0;
        }
        .heroFlow {
          margin: 14px 0;
          border: 1px solid #d9e5de;
          border-radius: 10px;
          padding: 12px;
          background: #f4f8f5;
          color: #2f4c3c;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
        }
        .workspace {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 18px;
          align-items: stretch;
        }
        .panel,
        .results,
        .verification,
        .sopSection,
        .error,
        .sidePanel {
          border: 1px solid rgba(24, 38, 31, 0.1);
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 20px 60px rgba(24, 38, 31, 0.07);
        }
        .panel {
          padding: 18px;
        }
        .panelHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }
        h2 {
          margin: 0;
          font-size: 24px;
          letter-spacing: 0;
        }
        .statusPill {
          border: 1px solid #d3ded8;
          border-radius: 999px;
          padding: 7px 10px;
          background: #f7faf8;
          color: #697a72;
          font-size: 12px;
          font-weight: 800;
        }
        .statusPill.ready {
          border-color: #a5d5b4;
          background: #edf9f0;
          color: #1d6b3b;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 14px;
        }
        button,
        .fileButton,
        .notionAction a {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          border: 1px solid #254235;
          border-radius: 6px;
          padding: 0 18px;
          background: #254235;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(37, 66, 53, 0.12);
          transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
        }
        button:hover,
        .notionAction a:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 26px rgba(37, 66, 53, 0.18);
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          transform: none;
          box-shadow: none;
        }
        .fileButton {
          min-height: 40px;
          padding: 0 14px;
          background: #f9fbfa;
          color: #254235;
          border-color: #9fb3a8;
          box-shadow: none;
        }
        .fileButton input {
          display: none;
        }
        .jsonInput {
          box-sizing: border-box;
          width: 100%;
          height: 256px;
          min-height: 160px;
          max-height: 16rem;
          overflow-y: auto;
          resize: vertical;
          border: 1px solid #c8d5ce;
          border-radius: 10px;
          padding: 16px;
          background: #fbfdfc;
          color: #18211c;
          font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", monospace;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
          transition: opacity 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .jsonInputDone {
          opacity: 0.5;
          border-color: #d9e3dd;
        }
        .sidePanel {
          padding: 20px;
          background: #17201b;
          color: #ffffff;
        }
        .sidePanel .eyebrow {
          color: #9bbbaa;
        }
        .sidePanel h2 {
          color: #ffffff;
        }
        .sopStructureLabel {
          margin-top: 22px;
        }
        .sidePanel p {
          margin: 18px 0 0;
          color: #c7d7cf;
          font-size: 14px;
          line-height: 1.55;
        }
        .deliverableList {
          display: grid;
          gap: 8px;
          margin-top: 18px;
        }
        .deliverableList span {
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 9px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
          color: #f8fbf9;
          font-size: 13px;
          font-weight: 750;
        }
        .error {
          margin-top: 16px;
          padding: 14px;
          border-color: #e8b9b0;
          background: #fff7f5;
          color: #8a2f22;
        }
        .results {
          margin-top: 36px;
          padding: 26px;
          border-top: 3px solid #254235;
          border-radius: 18px;
          background: #f7faf8;
        }
        .resultHead {
          margin-bottom: 18px;
        }
        .verification {
          padding: 18px;
          margin-bottom: 16px;
          background: #ffffff;
        }
        .metricRow {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
        }
        .metric {
          border: 1px solid #d9e3dd;
          border-radius: 12px;
          padding: 14px;
          background: #f7faf8;
        }
        .metric strong {
          display: block;
          margin-bottom: 4px;
          font-size: 24px;
          font-weight: 600;
          line-height: 1.15;
        }
        .metric span,
        .muted {
          color: #607169;
          font-size: 13px;
        }
        .pass {
          color: #1d6b3b;
        }
        .fail {
          color: #a43a22;
        }
        .hallucinationBadge {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          border: 1px solid #b9dfc5;
          border-radius: 999px;
          padding: 5px 10px;
          background: #eefaf1;
          color: #1d6b3b;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
        }
        .sopSection {
          padding: 20px;
          margin-top: 14px;
          background: #ffffff;
        }
        .sopSection h3 {
          margin: 0 0 12px;
          font-size: 19px;
          letter-spacing: 0;
        }
        .sopBody {
          margin: 0;
          white-space: pre-wrap;
          color: #27322d;
          font-size: 15px;
          line-height: 1.6;
        }
        ul {
          margin: 8px 0 0;
          padding-left: 20px;
        }
        li {
          margin: 4px 0;
        }
        .notionAction {
          margin-top: 18px;
          padding-top: 18px;
          border-top: 1px solid #d9e3dd;
        }
        .notionAction a {
          background: #17201b;
          border-color: #17201b;
        }
        @media (max-width: 900px) {
          .intro,
          .workspace {
            grid-template-columns: 1fr;
          }
          .heroPanel {
            max-width: 520px;
          }
        }
        @media (max-width: 700px) {
          .shell {
            padding: 18px 14px 52px;
          }
          .topbar {
            display: flex;
          }
          h1 {
            font-size: 36px;
          }
          .metricRow {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function VerificationCard({
  report,
  warning,
}: {
  report: VerificationReport;
  warning?: string;
}) {
  const completeness = `${(report.structuralCompleteness * 100).toFixed(1)}%`;
  return (
    <div className="verification">
      <div className="metricRow">
        <div className="metric">
          <strong>{completeness}</strong>
          <span>Significant-node coverage</span>
        </div>
        <div className="metric">
          <strong className={report.passed ? "pass" : "fail"}>
            {report.passed ? "PASS" : "FAIL"}
          </strong>
          <span>Verification status</span>
        </div>
        <div className="metric">
          {report.hallucinatedNodes.length === 0 ? (
            <strong className="hallucinationBadge">0 hallucinations ✓</strong>
          ) : (
            <strong className="fail">{report.hallucinatedNodes.length}</strong>
          )}
          <span>Hallucinated node refs</span>
        </div>
      </div>
      <p className="muted">{report.summary}</p>
      <NodeList title="Missing nodes" values={report.missingNodes} />
      <NodeList title="Hallucinated nodes" values={report.hallucinatedNodes} />
      {warning ? <p className="muted">{warning}</p> : null}
    </div>
  );
}

function NodeList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <p className="muted">{title}: {values.length ? "" : "none"}</p>
      {values.length ? (
        <ul>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SOPSection({ title, body }: { title: string; body: string }) {
  return (
    <article className="sopSection">
      <h3>{title}</h3>
      <p className="sopBody">{body}</p>
    </article>
  );
}
