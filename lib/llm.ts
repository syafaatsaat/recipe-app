import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmLog } from "@/lib/import/llm-call";

// The Claude client for the import fallback (doc §3.11). Off unless ANTHROPIC_API_KEY
// is set. The SDK also reads ANTHROPIC_BASE_URL, which the e2e run points at its mock.

let client: Anthropic | null = null;

export function llmClient(): LlmClient | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

/** Token counts per call go to the server log, so the real cost per import can be read. */
export const llmLog: LlmLog = (event, detail) => console.info(event, detail);
