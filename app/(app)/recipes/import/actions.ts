"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { attachRecipe, createImportJob, getImportJob, importsInLastHour } from "@/db/imports";
import { createRecipe } from "@/db/recipes";
import { endMissingAccount, isMissingAccount, requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fetchPage } from "@/lib/fetch-page";
import { toImportDraft } from "@/lib/import/draft";
import { extractRecipe, extractedRecipeSchema } from "@/lib/import/extract";
import { FLAG_BELOW } from "@/lib/import/parse-line";
import { parsePaste } from "@/lib/import/paste";
import { allowHostsFromEnv, checkUrl } from "@/lib/import/url-guard";
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
      const extracted = extractRecipe(page.html, page.url);
      if (!extracted) {
        jobId = await createImportJob(db, userId, { url, method: null, status: "failed", error: "No recipe data on that page." });
      } else {
        const flagged = toImportDraft(extracted).parsed.flat().some((p) => p.confidence < FLAG_BELOW);
        jobId = await createImportJob(db, userId, { url, method: extracted.method, status: flagged ? "partial" : "ok", rawPayload: extracted });
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
  const flagged = toImportDraft(extracted).parsed.flat().some((p) => p.confidence < FLAG_BELOW);
  let jobId: string;
  try {
    jobId = await createImportJob(db, userId, {
      url: source?.url ?? null,
      method: "paste",
      status: flagged ? "partial" : "ok",
      rawPayload: { ...extracted, url: source?.url ?? null, siteName: source?.url ? new URL(source.url).hostname.replace(/^www\./, "") : null },
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
