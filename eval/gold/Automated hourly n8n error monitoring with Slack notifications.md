<!--
Source template: https://n8n.io/workflows/7076-automated-hourly-n8n-error-monitoring-with-slack-notifications/
Eval category: Error handling (intended)
Written before any prompt iteration, per build plan.

⚠️ IMPORTANT STRUCTURAL NOTE:
This workflow monitors errors as its business purpose, but it does NOT use n8n's native Error Trigger
node or an `errorWorkflow` connection — it polls n8n's own REST API on a Schedule Trigger instead.
Your parser's error-handler detection (Stage 0, item 7: "errorWorkflow field, error-trigger nodes")
will correctly report this workflow as having NO structural error handling, even though its whole
purpose is error monitoring. That's not a parser bug — it's an accurate structural read. Keep this in
mind: this fixture won't exercise the errorWorkflow-detection code path itself. Consider a small
synthetic JSON later if you want a fixture that specifically triggers that detection logic.
-->

# Hourly n8n Error Monitoring to Slack — SOP

*Shape: error handling — Hourly n8n monitor → Slack*

## Overview

This workflow acts as a safety net for everything else running in your n8n instance. Once an hour, it checks whether any other workflow failed in the last hour, and if so, posts a summary to a Slack channel with a direct link to investigate — so failures get caught and surfaced automatically instead of being discovered when a client notices something didn't happen.

## At a Glance

| | |
|---|---|
| **Trigger** | Schedule Trigger — runs every hour |
| **Frequency** | Hourly (configurable) |
| **Systems involved** | n8n's own REST API (self), Slack |
| **Error handling** | **None structurally** — this workflow does not use an Error Trigger node or `errorWorkflow` setting. It detects failures in *other* workflows via polling, which is a different mechanism than n8n's built-in error-handling feature. |

## How It Works

1. **Schedule fires hourly.** The workflow wakes up once per hour.
2. **Config node sets the base URL.** A Set node holds the n8n instance's base URL, used later to build direct links back to the failed workflow.
3. **Query failed executions (HTTP Request).** Calls n8n's own API, authenticated via a header API key, to fetch all executions that failed in the last hour.
4. **Group errors by workflow.** The failed executions are consolidated so each workflow with failures gets one combined entry rather than one message per failure.
5. **Loop over each affected workflow (Split in Batches).** Iterates through the grouped results one workflow at a time.
6. **Build the alert message.** A message-formatting step (referred to as "MakeMessage" in the template) constructs a readable Slack message including the error count for that workflow.
7. **Post to Slack.** Sends the formatted alert to a configured Slack channel, including a button that links directly to the affected workflow in the n8n editor.

## Troubleshooting

**Structural error handling:** As noted above, this workflow has no error handler of its own — if *this* monitoring workflow itself fails (e.g., the n8n API call errors out), there is no fallback notification. That's a real, citable gap worth surfacing to the client: the watchdog has no watchdog.

**Common failure modes by node type:**
- **Schedule Trigger:** timezone drift — if the n8n instance's timezone setting doesn't match the team's expectation, "every hour" may not align with intended business hours.
- **HTTP Request (n8n API call):** header auth token expiry or misconfiguration; if the n8n API key is rotated, this node fails silently from the user's perspective.
- **Slack:** OAuth token expiry; incorrect channel name/ID causing messages to fail delivery without an obvious error to the end user.
