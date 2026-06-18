# Relay

Relay turns an exported n8n workflow JSON file into a client-ready Notion SOP.

It is built for the Zentra Labs take-home assignment: the important story is not just that an LLM writes text, but that the app parses workflow structure first, drafts from that representation, verifies the draft against the source, and only then publishes a reviewable Notion page.

## Why it exists

Automation consultants often hand clients n8n workflows that are hard to operate without tribal knowledge. Hand-written SOPs are useful, but slow to produce and easy to skip under deadline pressure. Relay reduces the handoff work by generating a structured SOP from the workflow itself while preserving a verification trail.

## Architecture

Relay follows the locked pipeline from the PRD:

1. **Parser**: deterministic TypeScript parser converts raw n8n JSON into `WorkflowRepresentation`.
2. **Draft**: Gemini drafts the four SOP sections from the parsed representation, not raw n8n JSON.
3. **Verify**: deterministic verifier checks significant-node coverage and explicit hallucinated node references.
4. **Publish**: if Notion env vars are present, the verified SOP is published under the Relay Drafts page.

The SOP sections are:

- Overview
- At a Glance
- How It Works
- Troubleshooting

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` as needed.

## Environment variables

Required for live SOP generation:

```bash
GEMINI_API_KEY=
GEMINI_DRAFT_MODEL=gemini-2.5-flash
GEMINI_VERIFY_MODEL=gemini-2.5-flash
```

Required for Notion publishing:

```bash
NOTION_INTEGRATION_TOKEN=
NOTION_DRAFTS_PAGE_ID=
```

If the Notion variables are missing, Relay still generates and verifies the SOP, then returns a publish warning instead of failing the whole request.

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run build
npm run eval
```

`npm run lint` currently invokes `next lint`, which asks for interactive ESLint setup in this project. It is not required for the MVP build path.

## Testing and eval

Unit tests cover the parser, draft prompt serialization, and deterministic verification.

The eval harness loads workflows from `eval/workflows/`, drafts SOPs, verifies them, and writes markdown reports to `eval/reports/`. When `GEMINI_API_KEY` is not set, eval uses a stub agent so parser and report plumbing can still be exercised without making a live model call.

The verifier reports:

- structural completeness
- covered nodes
- missing nodes
- hallucinated node references
- pass/fail status

## Deployment notes

Deploy on Vercel with the env vars listed above. For the submission demo, set the draft model to `gemini-2.5-flash` unless the Google AI Studio account has Gemini 2.5 Pro quota available.

After deployment:

1. Open the Vercel URL.
2. Paste or upload an n8n workflow JSON file.
3. Generate an SOP.
4. Confirm the verification report renders.
5. If Notion env vars are configured, confirm the Notion URL opens a page titled `[Workflow name] - SOP`.

## Known limitations

- Stage 2 verification is intentionally lightweight and deterministic for the MVP. It checks node coverage and explicit hallucinated node references, but does not yet include the full LLM-as-judge rubric for inferred claims.
- Gemini 2.5 Flash is the default draft model because free-tier Gemini 2.5 Pro quota may be unavailable.
- Notion block conversion supports headings, paragraphs, bullets, numbered lists, and basic bold text.
- The UI is a generation surface only. Notion remains the editor.
- Relay documents n8n workflows only. It does not critique, generate, or modify workflows.

## AI-assisted workflow notes

The implementation keeps the evidence trail visible:

- Locked product decisions live in `Relay_PRD.md` and `Relay_Build_Plan.md`.
- Prompt versions live in `lib/agent/prompts/` and `prompts-history/`.
- Parser and verifier behavior is covered by tests.
- Eval reports record generation and verification results.
- The final app preserves the intended pipeline instead of becoming a single-shot wrapper.
