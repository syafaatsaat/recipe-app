import { APIConnectionTimeoutError, RateLimitError } from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { LLM_TIMEOUT_MS, readLines, readRecipe, type LlmClient } from "./llm-call";

const usage = { input_tokens: 1200, output_tokens: 300 };
const fake = (impl: () => unknown) => {
  const parse = vi.fn(async () => impl());
  return { client: { messages: { parse } } as unknown as LlmClient, parse };
};

describe("llm calls", () => {
  it("sends the structured-output request, bounded, and returns the parsed answer", async () => {
    const out = { lines: [] };
    const { client, parse } = fake(() => ({ stop_reason: "end_turn", usage, parsed_output: out }));
    const log = vi.fn();
    expect(await readLines(client, ["1 cup flour"], log)).toEqual({ value: out, inputTokens: 1200, outputTokens: 300 });
    const [params, opts] = parse.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({ model: "claude-haiku-5-5", thinking: { type: "disabled" }, output_config: { effort: "low" } });
    expect(JSON.stringify(params.messages)).toContain("0: 1 cup flour");
    expect(opts).toEqual({ timeout: LLM_TIMEOUT_MS, maxRetries: 0 });
    expect(log).toHaveBeenCalledWith("llm lines", { stop: "end_turn", input: 1200, output: 300 });
  });

  it("a refusal, a cut-off answer or an unparseable one is null", async () => {
    for (const stop_reason of ["refusal", "max_tokens"]) {
      expect(await readRecipe(fake(() => ({ stop_reason, usage, parsed_output: { found: true } })).client, "page", vi.fn())).toEqual({ value: null, inputTokens: 1200, outputTokens: 300 });
    }
    expect((await readRecipe(fake(() => ({ stop_reason: "end_turn", usage, parsed_output: null })).client, "page", vi.fn())).value).toBeNull();
  });

  it("API errors and timeouts are logged and null, never thrown", async () => {
    const log = vi.fn();
    const errors = [
      new APIConnectionTimeoutError(),
      new RateLimitError(429, undefined, "rate limited", new Headers()),
      "odd",
    ];
    for (const err of errors) {
      expect(await readRecipe(fake(() => { throw err; }).client, "page", log)).toEqual({ value: null, inputTokens: 0, outputTokens: 0 });
    }
    expect(log).toHaveBeenCalledWith("llm recipe failed", { error: expect.stringContaining("timed out") });
    expect(log).toHaveBeenCalledWith("llm recipe failed", { error: "odd" });
  });
});
