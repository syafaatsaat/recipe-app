// One structured-output request to Claude, made safe for the import path (doc §3.11):
// bounded in time, no retries, and every failure (API error, refusal, cut-off or
// unparseable answer) becomes null so the import carries on without AI. The client is
// passed in, so this is testable without the network; lib/llm.ts supplies the real one.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { linesPrompt, LINES_SYSTEM, LLM_MODEL, llmLinesSchema, llmRecipeSchema, recipePrompt, RECIPE_SYSTEM, type LlmLines, type LlmRecipe } from "./llm";

export const LLM_TIMEOUT_MS = 20_000;
const MAX_TOKENS = 8000;

export type LlmClient = Pick<Anthropic, "messages">;
export type LlmLog = (event: string, detail: Record<string, unknown>) => void;
/** The answer (null on any failure) and what the call used, for llm_calls. */
export interface LlmResult<T> {
  value: T | null;
  inputTokens: number;
  outputTokens: number;
}

async function structured<S extends z.ZodType>(
  client: LlmClient,
  what: string,
  system: string,
  prompt: string,
  schema: S,
  log: LlmLog,
): Promise<LlmResult<z.infer<S>>> {
  try {
    const res = await client.messages.parse(
      {
        model: LLM_MODEL,
        max_tokens: MAX_TOKENS,
        // plain extraction: no thinking, low effort keeps it quick and cheap
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: zodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: LLM_TIMEOUT_MS, maxRetries: 0 },
    );
    const used = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    log(what, { stop: res.stop_reason, input: used.inputTokens, output: used.outputTokens });
    // a refusal or a cut-off (max_tokens) answer isn't used
    const value = res.stop_reason === "end_turn" ? ((res.parsed_output as z.infer<S> | null) ?? null) : null;
    return { value, ...used };
  } catch (e) {
    log(`${what} failed`, { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    return { value: null, inputTokens: 0, outputTokens: 0 };
  }
}

/** The recipe in a page's text, as the model reads it (unchecked: run toExtracted on it). */
export function readRecipe(client: LlmClient, pageText: string, log: LlmLog): Promise<LlmResult<LlmRecipe>> {
  return structured(client, "llm recipe", RECIPE_SYSTEM, recipePrompt(pageText), llmRecipeSchema, log);
}

/** The model's fields for each line (unchecked: run toHints on it). */
export function readLines(client: LlmClient, lines: readonly string[], log: LlmLog): Promise<LlmResult<LlmLines>> {
  return structured(client, "llm lines", LINES_SYSTEM, linesPrompt(lines), llmLinesSchema, log);
}
