import { and, arrayOverlaps, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { CatalogIngredient } from "@/lib/recipes/render-input";
import { gramsPerCupToDensity } from "@/lib/recipes/schema";
import type { Db } from "./client";
import { toCatalog } from "./recipes";
import { ingredients } from "./schema";
import { withUser } from "./withUser";

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Global catalog plus the user's own ingredients (RLS hides everyone else's), by name or alias. */
export async function searchIngredients(db: Db, userId: string, text: string, limit = 8): Promise<CatalogIngredient[]> {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select()
      .from(ingredients)
      .where(or(ilike(ingredients.name, like), sql`exists (select 1 from unnest(${ingredients.aliases}) a where a ilike ${like})`))
      .orderBy(
        // exact name or alias first, then names that start with the text, then the rest
        sql`case when lower(${ingredients.name}) = ${q} or ${q} = any(${ingredients.aliases}) then 0
                 when lower(${ingredients.name}) like ${escapeLike(q) + "%"} then 1 else 2 end`,
        asc(ingredients.name),
      )
      .limit(limit),
  );
  return rows.map(toCatalog);
}

/**
 * Adds one of the user's own ingredients (doc §3.7). Density is optional: without
 * it the ingredient scales but never converts between volume and weight.
 * Adding a name the user already has returns the existing one.
 */
export async function addMyIngredient(
  db: Db,
  userId: string,
  input: { name: string; gramsPerCup: number | null },
): Promise<CatalogIngredient> {
  const name = input.name.trim().toLowerCase();
  if (!name || name.length > 200) throw new Error("ingredient name must be 1–200 characters");
  if (input.gramsPerCup !== null && !(input.gramsPerCup > 0 && input.gramsPerCup < 2000)) {
    throw new Error("grams per cup must be between 0 and 2000");
  }
  return withUser(db, userId, async (tx) => {
    const [row] = await tx
      .insert(ingredients)
      .values({
        ownerId: userId,
        name,
        densityGPerMl: input.gramsPerCup === null ? null : String(gramsPerCupToDensity(input.gramsPerCup)),
      })
      .onConflictDoNothing()
      .returning();
    if (row) return toCatalog(row);
    const [existing] = await tx
      .select()
      .from(ingredients)
      .where(and(eq(ingredients.ownerId, userId), eq(ingredients.name, name)));
    return toCatalog(existing);
  });
}


/** The ingredient a typed name means, when it's an exact name or alias. Own rows win over the catalog. */
export async function matchIngredient(db: Db, userId: string, text: string): Promise<CatalogIngredient | null> {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .select()
      .from(ingredients)
      .where(or(sql`lower(${ingredients.name}) = ${q}`, sql`${q} = any(${ingredients.aliases})`))
      .orderBy(sql`${ingredients.ownerId} is null`)
      .limit(1),
  );
  return row ? toCatalog(row) : null;
}

/**
 * Catalog matches for many lines at once (the import review). `candidates[i]` lists
 * names for line i, most specific first (lib/import ingredientCandidates); the first
 * candidate that is a name or alias wins, and the user's own rows win over the catalog.
 */
export async function matchMany(db: Db, userId: string, candidates: readonly string[][]): Promise<(CatalogIngredient | null)[]> {
  const all = [...new Set(candidates.flat().map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (!all.length) return candidates.map(() => null);
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select()
      .from(ingredients)
      // aliases are stored lower-case, like matchIngredient expects
      .where(or(inArray(sql`lower(${ingredients.name})`, all), arrayOverlaps(ingredients.aliases, all)))
      .orderBy(sql`${ingredients.ownerId} is null`),
  );
  const byName = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    for (const key of [r.name.toLowerCase(), ...(r.aliases ?? []).map((a) => a.toLowerCase())]) {
      if (!byName.has(key)) byName.set(key, r); // own rows come first
    }
  }
  return candidates.map((list) => {
    for (const c of list) {
      const hit = byName.get(c.trim().toLowerCase());
      if (hit) return toCatalog(hit);
    }
    return null;
  });
}
