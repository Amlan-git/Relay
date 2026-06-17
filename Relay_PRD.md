# Relay

**Turn any n8n workflow into a client-ready Notion SOP — parsed, drafted, and self-verified.**

*Product Requirements Document · MVP v1 · June 2026*

---

## Problem statement

When an automation consultancy hands off an n8n workflow to a client's operations team, the workflow is opaque. The recipient cannot troubleshoot a failed run, cannot onboard new staff to operate it, and cannot safely modify parameters without risking breakage. The current solution — handwritten SOPs produced at handoff time — typically costs 2–3 hours per workflow, is often written under deadline pressure, and goes stale within weeks. Bad documentation creates support burden, damages client trust, and quietly taxes every engagement; good documentation is unprofitable to produce manually.

## Target user

The primary user is a **Zentra automation engineer** delivering n8n workflows to SMB clients as part of digital-transformation engagements. A typical engagement ships 5–15 workflows, each requiring handoff documentation written for a non-technical client operator. The secondary reader — the client operator who consumes the SOP — does not interact with Relay directly; the consultant is the operator and gatekeeper.

## Goals

1. Generate complete, structured SOPs from any n8n workflow JSON, written for non-technical operators.
2. Ground every structural claim in the source workflow; prevent hallucinated nodes or parameters via a dedicated self-verification step.
3. Publish directly to Zentra's Notion workspace for consultant review before client delivery.
4. Reduce per-workflow documentation time from 2–3 hours to under 2 minutes.

## Non-goals

Each excluded for a specific reason. These are deliberate scope choices, not omissions.

- **Workflow generation.** Relay documents existing workflows; it does not design or build them.
- **Workflow critique.** No opinions on whether a workflow is well-designed or where it should add error handling. Pure documentation.
- **Non-n8n platforms.** No Zapier, Make, or custom-script support. Each platform has its own data model; supporting all three would turn the parser into the entire product.
- **Auto-sync on workflow updates.** Relay produces SOPs on demand. Continuous sync would shift the architecture from request/response to service infrastructure and consume the build budget without proving the core thesis.
- **Diagrams (Mermaid, flowcharts).** Text-first by design. LLM-generated diagrams have known syntax-hallucination failure modes that would undermine the verification story.
- **In-app SOP editor.** The consultant reviews and edits in Notion. Notion is the editor; Relay is the generator.
- **Multi-tenant Notion OAuth.** MVP uses a single Zentra Notion integration token. Per-client OAuth is a day of work with no impact on the core insight.

## Core user flow

1. Consultant uploads or pastes an n8n workflow JSON in the Relay UI.
2. A deterministic parser extracts a structured workflow representation: ordered node list with classifications (trigger, transform, action, conditional, destination, error handler), data-flow trace, error-handler inventory, and the list of external systems referenced.
3. A three-stage LLM agent runs the pipeline:
   - **Draft** generates the four-section SOP grounded in the parsed representation.
   - **Self-verify** audits each structural claim against the parsed source, flagging or removing content that cannot be grounded.
   - **Refine** produces the final SOP with verification metadata attached.
4. The SOP is auto-published to a designated "Relay Drafts" page in Zentra's Notion workspace.
5. The UI displays a **verification report**: node coverage percentage, grounding-check results, and per-section confidence.
6. The consultant opens the Notion draft, reviews and edits if needed, then shares with the client.

## SOP structure (the deliverable spec)

Every generated SOP contains four sections. Each is mapped to a specific parser output and verified independently — this separation is what makes the verification story credible.

| Section | What it contains | How it is verified |
|---|---|---|
| **Overview** | Business purpose of the workflow, in plain language | LLM-as-judge plausibility, plus consistency check against parsed systems |
| **At a Glance** | Trigger, frequency, systems involved, error-handling presence | 100% verifiable 1:1 against parsed source |
| **How It Works** | Step-by-step plain-English walkthrough of significant nodes | Completeness check (% of source nodes correctly represented) plus no-fabrication check |
| **Troubleshooting** | Error-handler descriptions plus common failure modes for involved node types | Structural error handlers verified 1:1; inferred common issues constrained to a static catalog of known n8n failure modes |

Structural claims (At a Glance and the structural parts of How It Works and Troubleshooting) are 1:1 verifiable against the parsed source — no LLM creativity involved. Inferred claims (Overview, the explanatory layer in How It Works, common-issue suggestions) are constrained by a fixed catalog and audited by an LLM-as-judge rubric. The split is deliberate: it lets each truth condition be verified by the right method.

## Success metrics

**Primary metric.** ≥90% structural completeness on a held-out test set of three n8n workflows. Measured as the percentage of source workflow nodes correctly represented in the generated SOP, scored against hand-written gold SOPs via structural diff plus LLM-as-judge for inferred sections.

**Hard constraint.** Zero hallucinated nodes or parameters across the test set. A single fabricated node or mis-attributed parameter counts as a SOP failure regardless of other quality.

**Secondary metric.** Median time from JSON upload to publish-ready Notion SOP under 2 minutes.

The test set spans three workflow shapes to exercise distinct failure modes: one linear (trigger → action → destination), one with conditional branching, and one with explicit error-handler nodes. Hand-written gold SOPs are produced for each before any prompt iteration begins, so the eval harness is grounded before tuning starts.

## What was deliberately cut

Each of the following was considered for v1 and rejected with reasoning. The reasoning matters more than the cut: these are tempting features, and naming them is what makes the scope discipline visible.

- **Auto-sync on workflow updates.** Architectural shift to a continuous service. Out of scope for proving the core thesis.
- **Diagram generation (Mermaid, React Flow).** Would make the demo flashier, but LLM Mermaid syntax hallucination is well-documented and would erode the verification story Relay is built on.
- **Multi-platform support (Zapier, Make, scripts).** Each platform has its own data model; supporting all three dilutes the parser's quality at the n8n case.
- **In-app SOP editor.** Duplicates Notion's editing surface. The consultant already lives in Notion.
- **Multi-tenant Notion OAuth.** A day of engineering for per-client deployments. Single integration token works for MVP and demo without changing the architecture later.
- **Versioning and SOP history.** Useful in production, but not core to validating the agent's output quality.
- **"Expected outputs" section in the SOP.** Would require actually running the workflow to capture sample output. Out of static-analysis scope.
- **Safe-to-change parameters guidance.** Requires opinionated judgment about which parameters are stable; reads as consulting advice rather than documentation.

## Scaling notes

What would change at 10,000 workflows per month versus the MVP's single-tenant, on-demand model:

- Parser extracted as an independently versioned service with a cached n8n node-type catalog and schema validation against n8n's source.
- LLM calls routed by stage — fast/cheap model for parse-enrichment, capable model for inferred sections, provider fallback chain to handle rate limits.
- Eval harness integrated into CI; every prompt or parser change runs the full structural-completeness check before deploy.
- Multi-tenant Notion OAuth with per-client publish destinations.
- Versioned output store decoupled from Notion blocks, allowing re-publishes when the SOP template evolves.
- Cost telemetry per workflow to keep marginal generation cost predictable as volume grows.

---

*Author: [your name] · Built as Assignment 2 deliverable for Zentra Labs · Repo + walkthrough linked at submission*
