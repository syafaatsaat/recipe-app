"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  attachRecipe,
  createImportJob,
  DAILY_LLM_CALLS,
  DAILY_LLM_CALLS_ALL,
  getImportJob,
  importsInLastHour,
  llmCallsToday,
  llmCallsTodayAll,
  recordLlmCall,
} from "@/db/imports";
import { createRecipe } from "@/db/recipes";
import { endMissingAccount, isMissingAccount, requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fetchPage } from "@/lib/fetch-page";
import { toImportDraft } from "@/lib/import/draft";
import { extractRecipe, extractedRecipeSchema, type ExtractedRecipe } from "@/lib/import/extract";
import { MAX_HINT_LINES, pageMeta, pageText, toExtracted, toHints } from "@/lib/import/llm";
import { readLines, readRecipe, type LlmClient, type LlmResult } from "@/lib/import/llm-call";
import { FLAG_BELOW, parseLine } from "@/lib/import/parse-line";
import { parsePaste } from "@/lib/import/paste";
import { allowHostsFromEnv, checkUrl } from "@/lib/import/url-guard";
import { llmClient, llmLog } from "@/lib/llm";
import { recipeDraftSchema } from "@/lib/recipes/schema";

export type ImportState = { error?: string; value?: string };

/** Imports started per user per hour (each one fetches someone else's site). */
const HOURLY_LIMIT = 30;
const MAX_PASTE = 50_000;

async function rateLimited(userId: string): Promise<boolean> {
  return (await importsInLastHour(getDb(), userId)) >= HOURLY_LIMIT;
}
const LIMIT_ERROR = "That’s a lot of imports in the last hour. Try again in a little while.";

/** A failed write: an account that no longer exists signs out; anything else is logged and retried by hand. */
async function failed(where: string, e: unknown, message: string): Promise<{ error: string }> {
  if (isMissingAccount(e)) await endMissingAccount();
  console.error(where, e);
  return { error: message };
}

/**
 * One AI call (doc §3.11), when a key is set and both daily caps (the user's, everyone's) have room; every
 * call that ran is recorded, failed or not. Null means "carry on without AI".
 */
async function withAi<T>(userId: string, kind: "recipe" | "lines", run: (c: LlmClient) => Promise<LlmResult<T>>): Promise<T | null> {
  const client = llmClient();
  if (!client) return null;
  const db = getDb();
  const [mine, all] = await Promise.all([llmCallsToday(db, userId), llmCallsTodayAll(db)]);
  if (mine >= DAILY_LLM_CALLS || all >= DAILY_LLM_CALLS_ALL) return null;
  const r = await run(client);
  await recordLlmCall(db, userId, { kind, ok: r.value !== null, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
  return r.value;
}

/** AI readings for the flagged lines, kept as suggestions in the payload. */
async function withHints(userId: string, x: ExtractedRecipe): Promise<ExtractedRecipe> {
  const flagged = [...new Set(x.ingredients.map((i) => i.text))].filter((t) => parseLine(t).confidence < FLAG_BELOW).slice(0, MAX_HINT_LINES);
  if (!flagged.length) return x;
  const out = await withAi(userId, "lines", (c) => readLines(c, flagged, llmLog));
  const lineHints = out ? toHints(flagged, out) : {};
  return Object.keys(lineHints).length ? { ...x, lineHints } : x;
}

const isFlagged = (x: ExtractedRecipe) => toImportDraft(x).parsed.flat().some((p) => p.confidence < FLAG_BELOW);

/** Link → fetch → extract → a job to review. A page we can't read still makes a job: its review offers paste. */
export async function importFromUrl(_prev: ImportState, form: FormData): Promise<ImportState> {
  const userId = await requireUserId();
  const value = String(form.get("url") ?? "");
  const checked = checkUrl(value, allowHostsFromEnv(process.env.IMPORT_ALLOW_HOSTS, process.env.NODE_ENV));
  if (!checked.ok) return { error: checked.error, value };
  if (await rateLimited(userId)) return { error: LIMIT_ERROR, value };

  const db = getDb();
  const url = checked.url.toString();
  const page = await fetchPage(url);
  let jobId: string;
  try {
    if (!page.ok) {
      jobId = await createImportJob(db, userId, { url, method: null, status: "failed", error: page.error });
    } else {
      let extracted = extractRecipe(page.html, page.url);
      if (!extracted) {
        // no recipe data: let the model read the page, keeping only what the page says
        const text = pageText(page.html);
        const out = await withAi(userId, "recipe", (c) => readRecipe(c, text, llmLog));
        extracted = out ? toExtracted(out, text, pageMeta(page.html, page.url)) : null;
      }
      if (!extracted) {
        jobId = await createImportJob(db, userId, { url, method: null, status: "failed", error: "No recipe data on that page." });
      } else {
        extracted = await withHints(userId, extracted);
        // an AI-read page is always reviewed as needing a check
        const status = extracted.method === "llm" || isFlagged(extracted) ? "partial" : "ok";
        jobId = await createImportJob(db, userId, { url, method: extracted.method, status, rawPayload: extracted });
      }
    }
  } catch (e) {
    return { ...(await failed("importFromUrl failed", e, "Couldn’t start the import. Try again.")), value };
  }
  redirect(`/recipes/import/${jobId}`);
}

/** Pasted text → a job to review. `fromJob` is the failed link import it replaces, so the credit keeps its URL. */
export async function importFromText(_prev: ImportState, form: FormData): Promise<ImportState> {
  const userId = await requireUserId();
  const value = String(form.get("text") ?? "");
  if (!value.trim()) return { error: "Paste the recipe text first.", value };
  if (value.length > MAX_PASTE) return { error: "That’s too much text for one recipe.", value };
  if (await rateLimited(userId)) return { error: LIMIT_ERROR, value };

  const db = getDb();
  const fromJob = String(form.get("fromJob") ?? "");
  const source = z.uuid().safeParse(fromJob).success ? await getImportJob(db, userId, fromJob) : null;

  const extracted = parsePaste(value);
  if (!extracted.ingredients.length && !extracted.steps.length) {
    return { error: "Couldn’t find a recipe in that text. Include the ingredients, one per line.", value };
  }
  let jobId: string;
  try {
    const hinted = await withHints(userId, extracted);
    jobId = await createImportJob(db, userId, {
      url: source?.url ?? null,
      method: "paste",
      status: isFlagged(hinted) ? "partial" : "ok",
      rawPayload: { ...hinted, url: source?.url ?? null, siteName: source?.url ? new URL(source.url).hostname.replace(/^www\./, "") : null },
    });
  } catch (e) {
    return { ...(await failed("importFromText failed", e, "Couldn’t read that text. Try again.")), value };
  }
  redirect(`/recipes/import/${jobId}`);
}

/** Review → recipe (version 1, with the source and every line's raw text). */
export async function confirmImport(jobId: string, input: unknown): Promise<{ error: string }> {
  const userId = await requireUserId();
  if (!z.uuid().safeParse(jobId).success) return { error: "That import doesn’t exist." };
  const db = getDb();
  const job = await getImportJob(db, userId, jobId);
  if (!job) return { error: "That import doesn’t exist." };
  if (job.recipeId) redirect(`/recipes/${job.recipeId}`); // already imported: don't make a copy
  const payload = extractedRecipeSchema.safeParse(job.rawPayload);
  if (!payload.success) return { error: "There’s nothing to import yet." };

  const draft = recipeDraftSchema.safeParse(input);
  if (!draft.success) return { error: "Some lines can’t be saved. Import again, or write the recipe instead." };

  let recipeId: string;
  try {
    recipeId = await createRecipe(db, userId, draft.data, {
      sourceType: job.method === "paste" ? "paste" : "import",
      sourceUrl: payload.data.url ?? job.url,
      sourceName: payload.data.siteName,
    });
    await attachRecipe(db, userId, jobId, recipeId);
  } catch (e) {
    return failed("confirmImport failed", e, "Couldn’t save the recipe. Try again.");
  }
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}`);
}
