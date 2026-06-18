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
      <section className="intro">
        <p className="eyebrow">Relay</p>
        <h1>n8n workflow JSON to client-ready Notion SOP</h1>
        <p className="lede">
          Parser -&gt; Gemini draft -&gt; deterministic verification -&gt; optional Notion publish.
        </p>
      </section>

      <form className="panel" onSubmit={onSubmit}>
        <div className="toolbar">
          <label className="fileButton">
            Upload .json
            <input accept=".json,application/json" type="file" onChange={onFileChange} />
          </label>
          <button disabled={loading || jsonText.trim().length === 0} type="submit">
            {loading ? "Generating..." : "Generate SOP"}
          </button>
        </div>
        <textarea
          aria-label="n8n workflow JSON"
          placeholder={sampleHint}
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
        />
      </form>

      {error ? <div className="error">{error}</div> : null}

      {result ? (
        <section className="results">
          <div className="resultHead">
            <div>
              <p className="eyebrow">Generated SOP</p>
              <h2>{result.workflowName || "Untitled workflow"}</h2>
            </div>
            {result.notionUrl ? (
              <a href={result.notionUrl} rel="noreferrer" target="_blank">
                Open in Notion
              </a>
            ) : null}
          </div>

          <VerificationCard report={result.verification} warning={result.publishWarning} />

          <SOPSection title="Overview" body={result.sop.overview} />
          <SOPSection title="At a Glance" body={result.sop.atAGlance} />
          <SOPSection title="How It Works" body={result.sop.howItWorks} />
          <SOPSection title="Troubleshooting" body={result.sop.troubleshooting} />
        </section>
      ) : null}

      <style jsx>{`
        .shell {
          max-width: 1120px;
          margin: 0 auto;
          padding: 40px 20px 72px;
          color: #17201b;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }
        .intro {
          margin-bottom: 24px;
        }
        .eyebrow {
          margin: 0 0 8px;
          color: #476657;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
          text-transform: uppercase;
        }
        h1 {
          max-width: 760px;
          margin: 0;
          font-size: 40px;
          line-height: 1.08;
          letter-spacing: 0;
        }
        .lede {
          max-width: 720px;
          margin: 14px 0 0;
          color: #51605a;
          font-size: 17px;
          line-height: 1.55;
        }
        .panel,
        .results,
        .verification,
        .sopSection,
        .error {
          border: 1px solid #d9e3dd;
          border-radius: 8px;
          background: #fbfdfb;
        }
        .panel {
          padding: 14px;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        button,
        .fileButton,
        .resultHead a {
          display: inline-flex;
          min-height: 40px;
          align-items: center;
          border: 1px solid #254235;
          border-radius: 6px;
          padding: 0 14px;
          background: #254235;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .fileButton {
          background: #ffffff;
          color: #254235;
        }
        .fileButton input {
          display: none;
        }
        textarea {
          box-sizing: border-box;
          width: 100%;
          min-height: 360px;
          resize: vertical;
          border: 1px solid #c8d5ce;
          border-radius: 6px;
          padding: 14px;
          background: #ffffff;
          color: #18211c;
          font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", monospace;
        }
        .error {
          margin-top: 16px;
          padding: 14px;
          border-color: #e8b9b0;
          background: #fff7f5;
          color: #8a2f22;
        }
        .results {
          margin-top: 24px;
          padding: 18px;
        }
        .resultHead {
          display: flex;
          gap: 16px;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        h2 {
          margin: 0;
          font-size: 24px;
          letter-spacing: 0;
        }
        .verification {
          padding: 16px;
          margin-bottom: 14px;
          background: #ffffff;
        }
        .metricRow {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        .metric {
          border: 1px solid #d9e3dd;
          border-radius: 6px;
          padding: 12px;
          background: #f7faf8;
        }
        .metric strong {
          display: block;
          margin-bottom: 4px;
          font-size: 22px;
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
        .sopSection {
          padding: 16px;
          margin-top: 12px;
          background: #ffffff;
        }
        .sopSection h3 {
          margin: 0 0 10px;
          font-size: 18px;
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
        @media (max-width: 700px) {
          h1 {
            font-size: 31px;
          }
          .metricRow {
            grid-template-columns: 1fr;
          }
          .resultHead {
            display: block;
          }
          .resultHead a {
            margin-top: 12px;
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
          <strong>{report.hallucinatedNodes.length}</strong>
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
