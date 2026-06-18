<!--
Source template: https://n8n.io/workflows/2178-transcribe-audio-files-summarize-with-gpt-4-and-store-in-notion/
Eval category: Linear (trigger → action → destination)
Written before any prompt iteration, per build plan.
-->

# Audio File Transcription & Summary — SOP

*Shape: linear — Audio → Notion*

## Overview

This workflow watches a Google Drive folder for new audio recordings and automatically turns each one into a short written summary saved to Notion. It's built for anyone who regularly captures audio — interviews, lectures, voice memos, meeting recordings — and doesn't want to manually transcribe and write up each one. Drop a file in the folder, and a summarized, searchable note appears in Notion a few moments later with no further action needed.

## At a Glance

| | |
|---|---|
| **Trigger** | Google Drive Trigger — polls a specified folder for newly added files |
| **Frequency** | Continuous (polling interval as configured on the trigger node, typically every 1 minute) |
| **Systems involved** | Google Drive, OpenAI (Whisper + GPT-4), Notion |
| **Error handling** | None configured — no error workflow or Error Trigger node present in this template |

## How It Works

1. **New file detected (Google Drive Trigger).** The workflow watches a specific Drive folder. As soon as a new audio file appears there, it starts the run.
2. **Download the file (Google Drive).** The new file's binary content is pulled into the workflow so it can be processed.
3. **Transcribe the audio (OpenAI – Whisper).** The audio binary is sent to OpenAI's Whisper model, which returns a plain-text transcript of everything said in the recording.
4. **Summarize the transcript (OpenAI – GPT-4).** The transcript is passed to GPT-4 with a summarization prompt, producing a concise, readable summary of the key points.
5. **Create a Notion page (Notion).** A new page is created in the configured Notion database containing the summary (and typically the source filename/upload time as metadata).

## Troubleshooting

**Structural error handling:** This workflow has no error workflow attached and no Error Trigger node. If any step fails (e.g., an unsupported file format), the run simply fails with no automatic notification — this is a gap worth flagging to the client as a structural fact, not an inferred opinion.

**Common failure modes by node type** (from the static catalog, not workflow-specific):
- **Google Drive Trigger / Google Drive (OAuth-based):** credential token expiry — re-authentication needed periodically.
- **OpenAI (Whisper):** file-size and format limits (typically 25MB cap); unsupported codecs will fail outright.
- **OpenAI (GPT-4):** rate limiting / quota exhaustion on the account; large transcripts may exceed context limits and need chunking.
- **Notion:** invalid or unshared database ID — the integration must be explicitly connected to the target database, or the create-page call fails with a permission error.
