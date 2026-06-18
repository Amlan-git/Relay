# Relay — Build Plan & Handoff Doc

> Companion to `Relay_PRD.md`. The PRD covers *what* Relay is (problem, target user, goals, non-goals, cuts, success metric). This doc covers *how* to build it (architecture, stack, repo, eval, sequence, locked decisions). Read both before starting a new conversation about implementation.

---

## Project context

- **Product:** Relay — turns an n8n workflow JSON into a client-ready Notion SOP, auto-published to Notion with a verification report.
- **Built as:** Assignment 2 deliverable for Zentra Labs (AI Implementation Engineer role).
- **Build budget:** ~1 day (brief says ~1 hour estimated; extended to a day).
- **Deliverables:** live link (Vercel), repo, PRD, 5-minute walkthrough recording.
- **Will be built using:** Claude Code locally, with prompts driving the implementation.
- **Status:** PRD locked. Architecture, stack, repo structure, and build sequence locked. Ready to start with the eval harness.

---

## Tech stack (locked)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | Shared types between parser, agent, and eval harness |
| Framework | Next.js (App Router) | One project for frontend + backend, fast Vercel deploy |
| Styling | Tailwind + shadcn/ui | Vibe-coding-friendly, ships polished UI fast |
| Deployment | Vercel (free tier) | Single push, env vars, live URL |
| LLM | Gemini via Google AI Studio (free tier) | No Anthropic API key available; Gemini 2.5 Pro for draft, Flash for verify |
| LLM fallback | Groq (Llama 3.3 70B) | Free, fast, used only if Gemini rate limits hit during demo recording |
| Notion | `@notionhq/client` (REST API directly) | Gemini doesn't speak MCP; direct API is simpler than wiring an MCP server |
| Agent loop | Hand-rolled function-calling loop | No native MCP support; manual loop is ~80 lines and *more visible artifact* for the rubric |
| Eval harness | Node + TypeScript, run via `tsx` | Shares types with parser; direct function invocation (no HTTP roundtrip); single language repo |
| Versioning of prompts | Plain markdown files in `prompts-history/` | v1, v2, v3 each committed — generates the steering story for the walkthrough |

**Anti-patterns to avoid (do NOT re-litigate these):**
- ❌ Do not suggest Anthropic SDK with native MCP — no API key available, use Gemini
- ❌ Do not suggest Python for the eval harness — type sharing matters more than ecosystem
- ❌ Do not suggest setting up a Notion MCP server — direct REST API is simpler and faster
- ❌ Do not build a chat UI or in-app SOP editor — Notion is the editor (see PRD non-goals)
- ❌ Do not add multi-tenant OAuth — single Zentra integration token only
- ❌ Do not add Mermaid diagram generation — verification story is text-first by design
- ❌ Do not turn the SOP into a single-shot LLM call — the 3-stage agent is what escapes the "wrapper" critique

---

## Architecture: three stages

### Stage 0 — Parser (deterministic, no LLM)

**Input:** raw n8n workflow JSON
**Output:** `WorkflowRepresentation` (structured object the downstream stages reason over)

**Work it does:**
1. Parse and validate JSON against n8n's expected schema
2. Build the node list with ID, name, type, parameters, position
3. Classify each node — `trigger | transform | action | conditional | destination | error_handler` — based on type and connection topology
4. Trace data flow: for each node, compute upstream sources and downstream targets
5. Flag trivial nodes (Set, Edit Fields, basic data transforms) with `isTrivial: true` so the walkthrough can collapse them
6. Extract the systems list from credential references and node type prefixes (`n8n-nodes-base.slack` → "Slack")
7. Detect error-handler workflow connections (`errorWorkflow` field, error-trigger nodes)
8. Tag each node with known failure modes from a static catalog (HTTP → rate limits, OAuth → token expiry, Stripe → idempotency, webhook → missing signature, etc.)

**Critical:** this is pure TypeScript, fully unit-testable, no LLM. This is the engineering substance that elevates Relay above "AI wrapper."

### Stage 1 — Draft (LLM call)

**Input:** `WorkflowRepresentation` (not raw JSON — the LLM never sees raw n8n JSON)
**Output:** structured SOP draft (the four sections defined in the PRD)

**Prompt design principles:**
- Explicit instruction: only describe nodes present in the input
- Output schema: the four sections with structured sub-fields
- Few-shot: 1-2 examples of (representation → SOP) mapping
- Distinguish structural sections (At a Glance, How It Works structural facts) from inferred sections (Overview, How It Works prose, Troubleshooting common issues)

**Model:** Gemini 2.5 Pro (better reasoning for the inference layer).

### Stage 2 — Self-verify (deterministic + LLM)

**Input:** SOP draft + `WorkflowRepresentation`
**Output:** `VerificationReport` + refined SOP

**Two distinct verification methods for two distinct truth conditions:**

1. **Structural claims (deterministic).** Extract every node reference from the SOP. Diff against the representation:
   - Any node in SOP but not in representation = **hallucination flag** (hard fail)
   - Any node in representation but not in SOP = **completeness gap**
2. **Inferred claims (LLM-as-judge).** Each inferred claim ("captures leads from your website") is checked against the structural facts ("does the workflow actually have a webhook trigger from a form?") via a constrained rubric. No free-form judgment.

**If structural completeness <90% or any hallucinations:** trigger a refine pass to regenerate flagged sections (single retry, not infinite loop).

**Model:** Gemini 2.5 Flash (cheaper, the work here is verification not creativity).

### Stage 3 — Publish (Notion API)

**Input:** verified SOP + verification report
**Output:** Notion page URL

Creates a page under "Relay Drafts" parent. Title: `[Workflow name] — SOP`. Converts SOP markdown to Notion blocks (h1/h2, paragraphs, bulleted lists, tables for At a Glance). Attaches metadata: source workflow filename, verification report summary, timestamp.

---

## Locked product decisions (do not re-debate)

- **Target user:** Zentra consultant (internal tool framing), not the client operator who reads the SOP
- **Verification UX:** auto-publish to Notion "Drafts" page + visible in-app verification report. No user-triggered publish gate, no in-app SOP editor.
- **Primary metric:** ≥90% structural completeness on held-out test set of 3 workflows
- **Hard constraint:** zero hallucinated nodes or parameters
- **Secondary metric:** median time from upload to publish-ready SOP under 2 minutes
- **SOP structure:** 4 sections — Overview (inferred), At a Glance (structural), How It Works (mixed), Troubleshooting (mixed)
- **"Notion is the editor":** consultant edits the published SOP in Notion if needed; we do not build an editor

---

## Repo structure

```
relay/
├── app/                          Next.js App Router
│   ├── api/
│   │   └── generate/route.ts     POST workflow JSON → runs full pipeline
│   ├── page.tsx                  Upload UI + verification report
│   └── components/
│       ├── Uploader.tsx
│       ├── VerificationReport.tsx
│       └── StatusStream.tsx
├── lib/
│   ├── parser/
│   │   ├── index.ts              Main parser entry
│   │   ├── classify.ts           Node classification logic
│   │   ├── trace.ts              Data-flow tracing
│   │   ├── catalog.ts            Static failure-mode catalog
│   │   └── types.ts              WorkflowRepresentation (spine of the project)
│   ├── agent/
│   │   ├── draft.ts              Stage 1 — LLM draft
│   │   ├── verify.ts             Stage 2 — deterministic + LLM-judge
│   │   └── prompts/              draft.md, verify.md (current)
│   ├── notion/
│   │   ├── publish.ts            Stage 3 — Notion API
│   │   └── blocks.ts             SOP markdown → Notion blocks
│   └── gemini.ts                 Gemini client wrapper
├── eval/                         Standalone eval harness (Node TypeScript)
│   ├── workflows/                3 sample n8n JSONs (linear, branching, error handler)
│   ├── gold/                     3 hand-written gold SOPs in markdown
│   ├── score.ts                  Structural diff + LLM-as-judge scoring
│   └── run.ts                    Loads workflows, calls agent, scores, outputs markdown report
├── prompts-history/              v1, v2, v3 prompts committed — the steering story
├── README.md
└── package.json
```

---

## Build sequence (eval-first — this order matters)

The sequence below is non-negotiable. Eval harness FIRST, before any prompt iteration. Reasoning: the rubric explicitly rewards "where you steered and where you verified." If eval exists before prompts, every change has a measurable delta to point at in the walkthrough.

| # | Step | Time |
|---|---|---|
| 1 | **Eval harness scaffold** — pick 3 workflows, hand-write 3 gold SOPs, write scoring script. No agent yet. | 1.5 hr |
| 2 | **Parser** — deterministic TypeScript, unit-tested. No LLM calls. | 2 hr |
| 3 | **Draft (v1)** — Stage 1 LLM call with a deliberately rough prompt. Run eval. Get baseline (~70% expected). | 1 hr |
| 4 | **Verify** — Stage 2 deterministic checks + LLM-as-judge. | 1 hr |
| 5 | **Prompt iteration v1 → v2 → v3** — each iteration measured by eval. Commit each version. | 2 hr |
| 6 | **Notion publisher** — Stage 3, markdown → blocks → page creation. | 1 hr |
| 7 | **Frontend** — Next.js upload UI + verification report rendering. | 2 hr |
| 8 | **Deploy** — Vercel, env vars (`GEMINI_API_KEY`, `NOTION_INTEGRATION_TOKEN`, `NOTION_DRAFTS_PAGE_ID`), smoke test. | 1 hr |
| 9 | **README + walkthrough recording** | 1.5 hr |

**Total: ~13 hours.** Tight but fits the day-plus budget.

---

## Eval harness design

**Three workflows, three failure modes:**
- **Linear:** trigger → action → destination (e.g., form-to-Airtable, RSS-to-Slack)
- **Branching:** IF / Switch nodes producing distinct paths (e.g., lead routing, ticket triage)
- **Error handling:** explicit error workflow or error-trigger nodes (e.g., production-ready sync workflow with failure notifications)

**Where to find them:** n8n.io/workflows (canonical library, sort by votes). Search terms in the previous conversation: "form to airtable" / "lead routing" / "error handling" / "notify on failure". Filter for under 15 nodes and clear business purpose. If no good error-handler workflow exists, take a linear or branching one and bolt on an Error Trigger + Slack notify (mirrors real-world consulting work).

**Gold SOPs:** hand-written in the 4-section structure, in markdown, one per workflow. Written BEFORE any prompt iteration so the rubric is anchored before tuning starts.

**Scoring methodology:**
- **Section 2 (At a Glance):** binary pass/fail per claim, aggregated. 1:1 against parsed source.
- **Section 3 (How It Works):** completeness % — what % of source nodes appear correctly described. This is the **primary metric**.
- **Sections 1 & 4 (inferred):** LLM-as-judge against the gold SOP with a rubric ("Does the Overview accurately summarize the workflow? Are claimed systems consistent with source?").
- **Hallucination count:** any node mentioned in the SOP not present in the source = hard fail.

**Output:** a markdown report per run with scores per workflow + aggregate. Commit eval results alongside prompt versions so the steering story is reproducible.

---

## The "where I steered, where I verified" narrative arc

The walkthrough should explicitly tell this story. Expected shape:

- **v1 baseline:** rough prompt, hits ~70% structural completeness. Common failures: missing trigger context, conflated branches, hallucinated parameters.
- **v2 iteration:** added explicit "only describe nodes in the input" + few-shot example. Completeness jumps to ~85%. New issue: over-describes trivial nodes.
- **v3 iteration:** added trivial-node collapse logic + explicit structural-vs-inferred separation in the prompt. Completeness hits ~91%, hallucinations drop to zero.

This arc is the rubric answer. Make sure the `prompts-history/` folder reflects it.

---

## Open items for the next conversation

1. **Pick the 3 specific workflows** from n8n.io/workflows. Need URLs + downloaded JSONs.
2. **Set up Notion integration** — create internal integration, share with a "Relay Drafts" parent page, capture token + page ID.
3. **Get Gemini API key** from Google AI Studio (no credit card needed).
4. **Define the failure-mode catalog v1** — list of node types with known issues (suggested entries: HTTP → rate limit + auth, OAuth nodes → token expiry, Stripe → idempotency keys, Webhook → missing signature validation, Schedule → timezone drift).
5. **Start with the eval harness scaffold** (step 1 in build sequence) before anything else.

---

## What's in the PRD (don't re-litigate)

The PRD (`Relay_PRD.md`) is the authoritative source for:
- Problem statement and target user
- Goals and non-goals (8 explicit non-goals)
- Core user flow
- Success metrics (with measurement methodology)
- What was deliberately cut and why
- Scaling notes (10,000 workflows/month case)

If a question is about *what* Relay does or *why* a feature was excluded, the PRD answers it. This doc answers questions about *how* to build it.

---

*Pair this doc with `Relay_PRD.md` when opening a new conversation. Together they capture every decision made before implementation starts.*
