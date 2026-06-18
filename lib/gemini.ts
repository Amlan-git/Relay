/**
 * Gemini client wrapper.
 *
 * Thin abstraction over @google/genai's generateContent API. Callers pass a
 * system instruction, a user prompt, and a JSON schema; the wrapper enforces
 * structured JSON output, parses the response, and returns a typed value.
 *
 * No retry/backoff yet — Stage 1 is a single call per workflow and the eval
 * harness runs three of them. Retry policy lands when Stage 2 (verify) adds
 * its refine loop.
 */

import { GoogleGenAI, type Schema } from "@google/genai";

// Build Plan locked Pro for draft, Flash for verify. On the free Google AI
// Studio tier Pro is gated to limit=0 for many accounts, so the practical
// baseline model is Flash. Override via GEMINI_DRAFT_MODEL when you have Pro
// quota (paid tier).
export const DRAFT_MODEL = process.env.GEMINI_DRAFT_MODEL ?? "gemini-2.5-flash";
export const VERIFY_MODEL = process.env.GEMINI_VERIFY_MODEL ?? "gemini-2.5-flash";

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local or export it before running.",
    );
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

export interface GenerateStructuredOptions {
  model?: string;
  systemInstruction: string;
  userPrompt: string;
  jsonSchema: Schema;
}

export async function generateStructured<T>(
  opts: GenerateStructuredOptions,
): Promise<T> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: opts.model ?? DRAFT_MODEL,
    contents: opts.userPrompt,
    config: {
      systemInstruction: opts.systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: opts.jsonSchema,
    },
  });
  const text = response.text;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Gemini returned an empty response.");
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `Gemini returned non-JSON despite structured-output config. First 200 chars: ${text.slice(0, 200)}`,
    );
  }
}
