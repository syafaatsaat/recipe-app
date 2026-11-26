import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toImportDraft } from "@/lib/import/draft";
import { extractRecipe } from "@/lib/import/extract";
import { JSONLD_GRAPH } from "@/lib/import/fixtures";
import { ingredientCandidates } from "@/lib/import/parse-line";
import { createDb } from "./client";
import { addMyIngredient, matchMany } from "./ingredients";
import { attachRecipe, createImportJob, findBySourceUrl, getImportJob, importsInLastHour, llmCallsToday, llmCallsTodayAll, recordLlmCall } from "./imports";
import { createRecipe, getRecipe } from "./recipes";

const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, client } = createDb(URL);

const ALICE = "aaaaaaaa-3333-0000-0000-000000000000";
const BOB = "bbbbbbbb-3333-0000-0000-000000000000";

beforeAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`);
  await db.execute(sql`insert into auth.users (id, email) values (${ALICE}, 'a3@test.local'), (${BOB}, 'b3@test.local')`);
});

afterAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`);
  await client.end();
});

describe("llm calls", () => {
  it("counts a user's calls in the last day, failed ones included, and nobody else's", async () => {
    const before = await llmCallsToday(db, ALICE);
    const beforeAll = await llmCallsTodayAll(db);
    await recordLlmCall(db, ALICE, { kind: "recipe", ok: true, inputTokens: 1200, outputTokens: 300 });
    await recordLlmCall(db, ALICE, { kind: "lines", ok: false, inputTokens: 0, outputTokens: 0 });
    await recordLlmCall(db, BOB, { kind: "recipe", ok: true, inputTokens: 900, outputTokens: 200 });
    expect(await llmCallsToday(db, ALICE)).toBe(before + 2);
    expect(await llmCallsToday(db, BOB)).toBe(1);
    // the app-wide count sees everyone's calls
    expect(await llmCallsTodayAll(db)).toBe(beforeAll + 3);
    await db.execute(sql`delete from llm_calls where owner_id = ${BOB}`);
    await db.execute(sql`update llm_calls set created_at = now() - interval '25 hours' where owner_id = ${ALICE}`);
    expect(await llmCallsToday(db, ALICE)).toBe(0);
  });
});

describe("import jobs", () => {
  const extracted = extractRecipe(JSONLD_GRAPH, "https://example.com/cake")!;

  it("stores a job with its payload, private to its owner, and counts it for the rate limit", async () => {
    const before = await importsInLastHour(db, ALICE);
    const id = await createImportJob(db, ALICE, { url: "https://example.com/cake", method: "jsonld", status: "partial", rawPayload: extracted });
    const job = await getImportJob(db, ALICE, id);
    expect(job).toMatchObject({ url: "https://example.com/cake", method: "jsonld", status: "partial", recipeId: null });
    expect(job!.rawPayload).toEqual(extracted);
    expect(await getImportJob(db, BOB, id)).toBeNull();
    expect(await attachRecipe(db, BOB, id, "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await importsInLastHour(db, ALICE)).toBe(before + 1);
    expect(await importsInLastHour(db, BOB)).toBe(0);
  });

  it("stores a paste without a URL, and a failed link with its error", async () => {
    const paste = await createImportJob(db, ALICE, { url: null, method: "paste", status: "ok", rawPayload: { ...extracted, method: "paste" } });
    expect((await getImportJob(db, ALICE, paste))!.url).toBeNull();
    const failed = await createImportJob(db, ALICE, { url: "https://example.com/blocked", method: null, status: "failed", error: "blocked" });
    expect(await getImportJob(db, ALICE, failed)).toMatchObject({ status: "failed", error: "blocked", rawPayload: null });
  });

  it("confirming an import keeps the source, raw text and confidence, and links the job", async () => {
    const { draft, source } = toImportDraft(extracted);
    const jobId = await createImportJob(db, ALICE, { url: "https://example.com/cake", method: "jsonld", status: "ok", rawPayload: extracted });
    const recipeId = await createRecipe(db, ALICE, draft, { sourceType: "import", sourceUrl: source.url, sourceName: source.siteName });
    expect(await attachRecipe(db, ALICE, jobId, recipeId)).toBe(true);
    expect((await getImportJob(db, ALICE, jobId))!.recipeId).toBe(recipeId);

    const r = (await getRecipe(db, ALICE, recipeId))!;
    expect(r).toMatchObject({ sourceType: "import", sourceUrl: "https://example.com/lemon-olive-oil-cake", sourceName: "Example Kitchen" });
    expect(r.draft.sections[0].ingredients[4]).toMatchObject({ rawText: "1 stick butter, softened", parseConfidence: 0.97, quantity: 4, unitCode: "oz" });
    expect(r.draft.sections[0].ingredients[5].parseConfidence).toBeCloseTo(0.6, 5);

    expect(await findBySourceUrl(db, ALICE, "https://example.com/lemon-olive-oil-cake")).toMatchObject({ id: recipeId, title: "Lemon olive oil cake" });
    expect(await findBySourceUrl(db, BOB, "https://example.com/lemon-olive-oil-cake")).toBeNull();
  });
});

describe("matchMany", () => {
  it("takes the first candidate that matches, by name or alias", async () => {
    const lines = ["extra-virgin olive oil", "large eggs", "all-purpose flour", "dragon fruit", "plain flour"];
    const hits = await matchMany(db, ALICE, lines.map(ingredientCandidates));
    expect(hits.map((h) => h?.name ?? null)).toEqual([null, "egg", "all-purpose flour", null, "all-purpose flour"]);
  });

  it("prefers the user's own ingredient, and hides it from others", async () => {
    await addMyIngredient(db, ALICE, { name: "dragon fruit", gramsPerCup: null });
    const [mine] = await matchMany(db, ALICE, [ingredientCandidates("dragon fruit")]);
    expect(mine).toMatchObject({ name: "dragon fruit", mine: true });
    const [theirs] = await matchMany(db, BOB, [ingredientCandidates("dragon fruit")]);
    expect(theirs).toBeNull();
  });

  it("handles no candidates", async () => {
    expect(await matchMany(db, ALICE, [[], [""]])).toEqual([null, null]);
  });
});
