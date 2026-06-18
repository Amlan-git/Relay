<!--
Source: screenshot of the actual HubSpot→Jira template canvas (provided by user, 2026-06-18)
Eval category: Branching (conditional nodes producing distinct paths)
Written before any prompt iteration, per build plan.

⚠️ VERIFY WHEN EXPORTING THE JSON:
The "Sub-worflows for agents" section starts with a "When Executed by Another Workflow" trigger —
this is the entry point of what's likely a SEPARATE n8n workflow that Sentinel/Profiler call into as
tools. Confirm whether Router / Sentinel_agent / Profiler_agent / from_crm are bundled into the same
exported JSON, or live in a second workflow file referenced by ID. If they're separate, the parser
will only see the Category Classifier branch (still valid branching), not the Router Switch node.
-->

# HubSpot Support Ticket Classification & Jira Routing — SOP

*Shape: branching — HubSpot → Jira routing*

## Overview

This workflow turns incoming HubSpot support tickets into categorized Jira issues without a human doing the first-pass triage. An orchestrating AI agent gathers context on each ticket — pulling in a risk/sentiment read from a "Sentinel" sub-agent and enriched customer context from a "Profiler" sub-agent — then a classifier sorts the ticket into one of four categories (invoicing, technical, commercial, fulfillment) before a matching Jira issue is created.

## At a Glance

| | |
|---|---|
| **Trigger** | Manual Trigger ("For testing", dev use) or Schedule Trigger ("Set the running interval", production) |
| **Frequency** | Per configured schedule interval (production path); ad hoc when run manually |
| **Systems involved** | HubSpot, Jira Software, OpenAI (one shared Chat Model used by the Orchestrator, Sentinel_agent, Profiler_agent, and Category Classifier) |
| **Error handling** | None — no Error Trigger or error-workflow connection present on this canvas |
| **Branching** | Two distinct conditional nodes: (1) Category Classifier — 4-way split (invoicing/technical/commercial/fulfillment), all converging into one Jira-create node; (2) Router (Switch, mode: Rules) inside the agent sub-workflow — splits into "sentinel" / "profiler" paths |

## How It Works

1. **Trigger.** "For testing" (Manual Trigger) is the dev-only entry point; "Set the running interval" (Schedule Trigger) is the production path.
2. **Get many tickets** (HubSpot — getAll: ticket): fetches current support tickets from HubSpot.
3. **Search contacts** (HubSpot — search: contact): looks up the contact record tied to each ticket.
4. **Set the variables** (Set node): consolidates ticket + contact data into the variables the rest of the workflow uses.
5. **Orchestrator** (AI Agent): the central decision-maker. It has access to two tool sub-agents and a Structured Output Parser to keep its output shape consistent:
   - **Sentinel** (tool → sub-workflow "Sentinel_agent"): reads the ticket for emotional tone, churn risk, and purchase intent.
   - **Profiler** (tool → sub-workflow "Profiler_agent"): enriches the customer profile, pulling additional contact data from HubSpot via a "from_crm" node.
   - Inside that sub-workflow, a **Router** Switch node (mode: Rules) decides whether an incoming call is a "sentinel" request or a "profiler" request and sends it down the matching agent path.
6. **generate ticket title** (Set node): builds the Jira ticket's title/description text from the Orchestrator's output.
7. **Category Classifier**: sorts the ticket into one of four categories — invoicing, technical, commercial, or fulfillment — using the shared OpenAI Chat Model.
8. **Create an issue in Jira** (Jira — create: issue): all four classifier outputs converge here; the node presumably sets category-specific fields (project, issue type, or labels) based on which branch fired.

## Troubleshooting

**Structural error handling:** None present — no Error Trigger or error workflow attached to this canvas. A failure anywhere in the Orchestrator's multi-step reasoning chain has no defined fallback.

**Common failure modes by node type:**
- **HubSpot nodes** (Get many tickets, Search contacts, from_crm): OAuth token expiry; rate limits during high ticket volume.
- **Shared OpenAI Chat Model:** since the Orchestrator, Sentinel_agent, Profiler_agent, and Category Classifier all depend on one model node, a single rate-limit hit affects every one of them at once — a concentrated failure point worth calling out explicitly to the client.
- **Schedule Trigger:** timezone drift between the configured interval and the team's actual business hours.
- **Jira (Create an issue):** invalid or mismatched project/issue-type ID; permission errors if the integration's Jira user lacks create-issue rights on the target project.
- **Sub-workflow call pattern (Sentinel/Profiler as tools):** if the referenced sub-workflow isn't present in the target n8n instance (e.g., it wasn't included when cloning this template), the tool call fails at runtime — a common gotcha with AI-agent-as-tool patterns.
