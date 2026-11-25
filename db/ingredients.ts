import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
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

