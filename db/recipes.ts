// Recipe reads and writes. Every function runs through withUser, so RLS decides
// what the user can see and change; userId must come from lib/auth.ts.
import { and, asc, desc, eq, inArray, max, or, sql } from "drizzle-orm";
import { recipeDraftSchema, SNAPSHOT_SCHEMA, type RecipeDraft, type RecipeSnapshot } from "@/lib/recipes/schema";
import type { CatalogIngredient } from "@/lib/recipes/render-input";
import type { Db, Tx } from "./client";
import { photosOf, syncPhotos, type PhotoInput, type StoredPhoto } from "./photos";
import { ingredients, pans, recipeImages, recipeIngredients, recipes, recipeSections, recipeSteps, recipeVersions } from "./schema";
import { withUser } from "./withUser";

/** numeric columns arrive as strings */
const num = (v: string | null): number | null => (v === null ? null : Number(v));
const str = (v: number | null): string | null => (v === null ? null : String(v));

export interface RecipeSummary {
  id: string;
  title: string;
  yieldQty: number | null;
  yieldUnit: string | null;
  panLabel: string | null;
  updatedAt: string;
  /** the cover's small size (an upload's thumb path) or an imported link */
  cover: { thumbPath: string | null; externalUrl: string | null } | null;
}

export interface StoredRecipe {
  id: string;
  draft: RecipeDraft;
  versionNo: number;
  versionCount: number;
  updatedAt: string;
  sourceType: "import" | "manual" | "paste";
  sourceUrl: string | null;
  sourceName: string | null;
  /** the linked ingredients, for render() and the editor's chips */
  catalog: Record<string, CatalogIngredient>;
  /** the photos the draft uses, with where they're stored, to sign or link */
  photos: StoredPhoto[];
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listRecipes(db: Db, userId: string, q?: string): Promise<RecipeSummary[]> {
  const query = q?.trim();
  return withUser(db, userId, (tx) =>
    tx
      .select({
        id: recipes.id,
        title: recipes.title,
        yieldQty: recipes.yieldQty,
        yieldUnit: recipes.yieldUnit,
        panLabel: pans.label,
        updatedAt: recipes.updatedAt,
        coverThumb: recipeImages.thumbPath,
        coverUrl: recipeImages.externalUrl,
      })
      .from(recipes)
      .leftJoin(pans, eq(pans.id, recipes.panId))
      .leftJoin(recipeImages, and(eq(recipeImages.recipeId, recipes.id), eq(recipeImages.isCover, true)))
      .where(
        query
          ? or(
              sql`${recipes.search} @@ websearch_to_tsquery('english', ${query})`,
              sql`${recipes.title} ilike ${"%" + escapeLike(query) + "%"}`,
            )
          : undefined,
      )
      .orderBy(desc(recipes.updatedAt))
      .limit(200)
      .then((rows) =>
        rows.map(({ coverThumb, coverUrl, ...r }) => ({
          ...r,
          yieldQty: num(r.yieldQty),
          cover: coverThumb || coverUrl ? { thumbPath: coverThumb, externalUrl: coverUrl } : null,
        })),
      ),
  );
}

export async function getRecipe(db: Db, userId: string, id: string): Promise<StoredRecipe | null> {
  return withUser(db, userId, async (tx) => {
    const [r] = await tx.select().from(recipes).where(eq(recipes.id, id));
    if (!r) return null;
    const [sections, lines, steps, versions, stored] = await Promise.all([
      tx.select().from(recipeSections).where(eq(recipeSections.recipeId, id)).orderBy(asc(recipeSections.position)),
      tx.select().from(recipeIngredients).where(eq(recipeIngredients.recipeId, id)).orderBy(asc(recipeIngredients.position)),
      tx.select().from(recipeSteps).where(eq(recipeSteps.recipeId, id)).orderBy(asc(recipeSteps.position)),
      tx
        .select({ versionNo: recipeVersions.versionNo, id: recipeVersions.id })
        .from(recipeVersions)
        .where(eq(recipeVersions.recipeId, id)),
      photosOf(tx, id),
    ]);
    // a photo is in the draft when it has a place: the cover, or a step that still exists
    const stepIndex = new Map(steps.map((st, i) => [st.id, i]));
    const cover = stored.find((p) => p.isCover) ?? null;
    const photos = stored.filter((p) => p.isCover || (p.stepId !== null && stepIndex.has(p.stepId)));
    const photoOfStep = new Map(photos.flatMap((p) => (p.stepId !== null && !p.isCover ? [[stepIndex.get(p.stepId)!, p.id] as const] : [])));

    const toLine = (l: (typeof lines)[number]) => ({
      quantity: num(l.quantity),
      quantityMax: num(l.quantityMax),
      unitCode: l.unitCode as RecipeDraft["sections"][number]["ingredients"][number]["unitCode"],
      ingredientId: l.ingredientId,
      name: l.name,
      preparation: l.preparation,
      note: l.note,
      isOptional: l.isOptional,
      scalingRule: l.scalingRule,
      rawText: l.rawText,
      parseConfidence: l.parseConfidence,
    });
    const draftSections: RecipeDraft["sections"] =
      sections.length === 0
        ? [{ title: null, ingredients: lines.map(toLine) }]
        : sections.map((s, i) => ({
            title: s.title,
            // a line whose section was removed (section_id set null) lands in the first section
            ingredients: lines.filter((l) => l.sectionId === s.id || (i === 0 && l.sectionId === null)).map(toLine),
          }));

    const draft: RecipeDraft = {
      title: r.title,
      description: r.description,
      yieldQty: num(r.yieldQty),
      yieldUnit: r.yieldUnit,
      panId: r.panId,
      prepMin: r.prepMin,
      cookMin: r.cookMin,
      ovenTempC: num(r.ovenTempC),
      ovenUnit: r.ovenTempC !== null && (r.ovenTempUnit === "F" || r.ovenTempUnit === "C") ? r.ovenTempUnit : null,
      sections: draftSections,
      steps: steps.map((s, i) => ({ body: s.body, photoId: photoOfStep.get(i) ?? null })),
      photos: photos.map((p) => ({ id: p.id, width: p.width, height: p.height, alt: p.alt })),
      coverPhotoId: cover?.id ?? null,
    };

    const ids = [...new Set(lines.map((l) => l.ingredientId).filter((x): x is string => x !== null))];
    const catalogRows = ids.length ? await tx.select().from(ingredients).where(inArray(ingredients.id, ids)) : [];
    const catalog = Object.fromEntries(catalogRows.map((c) => [c.id, toCatalog(c)]));

    const current = versions.find((v) => v.id === r.currentVersionId);
    return {
      id: r.id,
      draft,
      versionNo: current?.versionNo ?? Math.max(0, ...versions.map((v) => v.versionNo)),
      versionCount: versions.length,
      updatedAt: r.updatedAt,
      sourceType: r.sourceType,
      sourceUrl: r.sourceUrl,
      sourceName: r.sourceName,
      catalog,
      photos,
    };
  });
}

export function toCatalog(c: typeof ingredients.$inferSelect): CatalogIngredient {
  return {
    id: c.id,
    name: c.name,
    mine: c.ownerId !== null,
    densityGPerMl: num(c.densityGPerMl),
    eachG: num(c.eachG),
    defaultScalingRule: c.defaultScalingRule,
    preferMassInMetric: c.preferMassInMetric,
    // the catalog egg enables the beaten-egg remainder (doc §5 rule 6)
    isEgg: c.ownerId === null && c.name === "egg",
  };
}

function recipeColumns(draft: RecipeDraft) {
  return {
    title: draft.title,
    description: draft.description,
    yieldQty: str(draft.yieldQty),
    yieldUnit: draft.yieldUnit,
    panId: draft.panId,
    prepMin: draft.prepMin,
    cookMin: draft.cookMin,
    totalMin: draft.prepMin !== null && draft.cookMin !== null ? draft.prepMin + draft.cookMin : null,
    ovenTempC: str(draft.ovenTempC),
    ovenTempUnit: draft.ovenTempC === null ? null : draft.ovenUnit,
  };
}

/** Writes sections, lines and steps; returns the new step ids in draft order. */
async function writeChildren(tx: Tx, recipeId: string, draft: RecipeDraft): Promise<string[]> {
  // One untitled section means "no sections": lines are stored without a section row.
  const sectioned = !(draft.sections.length === 1 && draft.sections[0].title === null);
  const sectionIds = sectioned
    ? (
        await tx
          .insert(recipeSections)
          .values(draft.sections.map((s, i) => ({ recipeId, title: s.title ?? "", position: i })))
          .returning({ id: recipeSections.id, position: recipeSections.position })
      )
        .sort((a, b) => a.position - b.position)
        .map((s) => s.id)
    : [];

  let position = 0;
  const lines = draft.sections.flatMap((s, si) =>
    s.ingredients.map((l) => ({
      recipeId,
      sectionId: sectioned ? sectionIds[si] : null,
      position: position++,
      quantity: str(l.quantity),
      quantityMax: str(l.quantityMax),
      unitCode: l.unitCode,
      ingredientId: l.ingredientId,
      name: l.name,
      preparation: l.preparation,
      note: l.note,
      isOptional: l.isOptional,
      scalingRule: l.scalingRule,
      rawText: l.rawText,
      parseConfidence: l.parseConfidence,
    })),
  );
  if (lines.length) await tx.insert(recipeIngredients).values(lines);
  if (!draft.steps.length) return [];
  const steps = await tx
    .insert(recipeSteps)
    .values(draft.steps.map((s, i) => ({ recipeId, position: i, body: s.body })))
    .returning({ id: recipeSteps.id, position: recipeSteps.position });
  return steps.sort((a, b) => a.position - b.position).map((st) => st.id);
}

async function writeVersion(tx: Tx, recipeId: string, versionNo: number, draft: RecipeDraft, changeNote: string | null) {
  const snapshot: RecipeSnapshot = { schema: SNAPSHOT_SCHEMA, draft };
  const [v] = await tx
    .insert(recipeVersions)
    .values({ recipeId, versionNo, snapshot, changeNote })
    .returning({ id: recipeVersions.id });
  await tx.update(recipes).set({ currentVersionId: v.id }).where(eq(recipes.id, recipeId));
}

export interface RecipeSource {
  sourceType: "import" | "manual" | "paste";
  /** the page it came from (doc §1: credit stays with the recipe) */
  sourceUrl?: string | null;
  sourceName?: string | null;
}

/** Creates the recipe and its version 1. Returns the new id. */
export async function createRecipe(
  db: Db,
  userId: string,
  input: RecipeDraft,
  source: RecipeSource = { sourceType: "manual" },
  photos: PhotoInput = {},
): Promise<string> {
  const draft = recipeDraftSchema.parse(input);
  return withUser(db, userId, async (tx) => {
    const [r] = await tx
      .insert(recipes)
      .values({
        ownerId: userId,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl ?? null,
        sourceName: source.sourceName ?? null,
        ...recipeColumns(draft),
      })
      .returning({ id: recipes.id });
    const stepIds = await writeChildren(tx, r.id, draft);
    await syncPhotos(tx, userId, r.id, draft, stepIds, photos);
    await writeVersion(tx, r.id, 1, draft, null);
    return r.id;
  });
}

/**
 * Replaces the recipe's content and adds a version. Returns the new version
 * number, or null when the recipe doesn't exist or isn't the user's.
 */
export async function updateRecipe(
  db: Db,
  userId: string,
  id: string,
  input: RecipeDraft,
  changeNote: string | null = null,
  photos: PhotoInput = {},
): Promise<number | null> {
  const draft = recipeDraftSchema.parse(input);
  return withUser(db, userId, async (tx) => {
    // row lock: two saves at once must not both pick the same version_no
    const locked = await tx.select({ id: recipes.id }).from(recipes).where(eq(recipes.id, id)).for("update");
    if (locked.length === 0) return null;

    await tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id));
    await tx.delete(recipeSteps).where(eq(recipeSteps.recipeId, id));
    await tx.delete(recipeSections).where(eq(recipeSections.recipeId, id));
    await tx.update(recipes).set(recipeColumns(draft)).where(eq(recipes.id, id));
    const stepIds = await writeChildren(tx, id, draft);
    await syncPhotos(tx, userId, id, draft, stepIds, photos);

    const [{ latest }] = await tx
      .select({ latest: max(recipeVersions.versionNo) })
      .from(recipeVersions)
      .where(eq(recipeVersions.recipeId, id));
    const versionNo = (latest ?? 0) + 1;
    await writeVersion(tx, id, versionNo, draft, changeNote);
    return versionNo;
  });
}

/** True when a recipe was deleted. Children and versions go with it (on delete cascade). */
export async function deleteRecipe(db: Db, userId: string, id: string): Promise<boolean> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx.delete(recipes).where(eq(recipes.id, id)).returning({ id: recipes.id });
    return rows.length > 0;
  });
}
