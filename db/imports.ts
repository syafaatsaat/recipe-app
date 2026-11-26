// Import jobs (doc §4 import_jobs): one row per import attempt, holding the
// extracted recipe as raw_payload so the review page can re-parse it.
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import type { ExtractedRecipe } from "@/lib/import/extract";
import type { Db } from "./client";
import { importJobs, llmCalls, recipes } from "./schema";
import { withUser } from "./withUser";

export type ImportMethod = ExtractedRecipe["method"];

export interface ImportJob {
  id: string;
  url: string | null;
  method: ImportMethod | null;
  status: "ok" | "partial" | "failed";
  rawPayload: unknown;
  error: string | null;
  recipeId: string | null;
  createdAt: string;
}

export async function createImportJob(
  db: Db,
  userId: string,
  job: { url: string | null; method: ImportMethod | null; status: ImportJob["status"]; rawPayload?: ExtractedRecipe | null; error?: string | null },
): Promise<string> {
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .insert(importJobs)
      .values({ ownerId: userId, url: job.url, method: job.method, status: job.status, rawPayload: job.rawPayload ?? null, error: job.error ?? null })
      .returning({ id: importJobs.id }),
  );
  return row.id;
}

export async function getImportJob(db: Db, userId: string, id: string): Promise<ImportJob | null> {
  const [row] = await withUser(db, userId, (tx) => tx.select().from(importJobs).where(eq(importJobs.id, id)));
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    method: row.method as ImportMethod | null,
    status: row.status as ImportJob["status"],
    rawPayload: row.rawPayload,
    error: row.error,
    recipeId: row.recipeId,
    createdAt: row.createdAt,
  };
}

/** Links the job to the recipe it became. False when the job isn't the user's. */
export async function attachRecipe(db: Db, userId: string, jobId: string, recipeId: string): Promise<boolean> {
  const rows = await withUser(db, userId, (tx) =>
    tx.update(importJobs).set({ recipeId }).where(eq(importJobs.id, jobId)).returning({ id: importJobs.id }),
  );
  return rows.length > 0;
}

/** For the rate limit: imports this user started in the last hour. */
export async function importsInLastHour(db: Db, userId: string): Promise<number> {
  const [row] = await withUser(db, userId, (tx) =>
    tx.select({ n: count() }).from(importJobs).where(gt(importJobs.createdAt, sql`now() - interval '1 hour'`)),
  );
  return row.n;
}

/** The user's most recent recipe imported from this URL, so the review can say so. */
export async function findBySourceUrl(
  db: Db,
  userId: string,
  url: string,
): Promise<{ id: string; title: string; createdAt: string } | null> {
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .select({ id: recipes.id, title: recipes.title, createdAt: recipes.createdAt })
      .from(recipes)
      .where(and(eq(recipes.sourceUrl, url)))
      .orderBy(desc(recipes.createdAt))
      .limit(1),
  );
  return row ?? null;
}

/** AI calls a user may make per day (doc §3.11). */
export const DAILY_LLM_CALLS = 20;

/** AI calls everyone together may make per day: a ceiling on the bill however many accounts exist (doc §3.11). */
export const DAILY_LLM_CALLS_ALL = 500;

/** Everyone's AI calls in the last 24 hours. Counts across users, so it reads as the server's role, not through withUser. */
export async function llmCallsTodayAll(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(llmCalls).where(gt(llmCalls.createdAt, sql`now() - interval '1 day'`));
  return row.n;
}

/** The user's AI calls in the last 24 hours, failed ones included (they cost too). */
export async function llmCallsToday(db: Db, userId: string): Promise<number> {
  const [row] = await withUser(db, userId, (tx) =>
    tx.select({ n: count() }).from(llmCalls).where(gt(llmCalls.createdAt, sql`now() - interval '1 day'`)),
  );
  return row.n;
}

/**
 * Records one AI call. Users can't write llm_calls (so they can't reset the cap), so this
 * runs as the server's own role, not through withUser; the owner comes from requireUserId.
 */
export async function recordLlmCall(
  db: Db,
  userId: string,
  call: { kind: "recipe" | "lines"; ok: boolean; inputTokens: number; outputTokens: number },
): Promise<void> {
  await db.insert(llmCalls).values({ ownerId: userId, ...call });
}
