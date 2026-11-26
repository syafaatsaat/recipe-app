// recipe_images for a recipe (doc §3.12): read them, and bring them in line with a
// saved draft inside the save's transaction. Storage objects are handled by the
// caller (lib/photos/storage.ts): checked before the save, removed after it.
import { and, asc, eq, inArray } from "drizzle-orm";
import { photoPaths, planPhotoSync, type PhotoRow } from "@/lib/photos/photos";
import type { RecipeDraft } from "@/lib/recipes/schema";
import type { Db, Tx } from "./client";
import { recipeImages } from "./schema";
import { withUser } from "./withUser";

export interface StoredPhoto extends PhotoRow {
  externalUrl: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
  isCover: boolean;
  stepId: string | null;
}

/** What a save may add besides the draft: which new ids are checked uploads, and an imported link. */
export interface PhotoInput {
  /** new photo ids whose objects were found in the user's own folder */
  uploads?: ReadonlySet<string>;
  imported?: { id: string; url: string } | null;
}

/** A photo in the draft that isn't a checked upload: refuse the save. */
export class PhotoNotUploadedError extends Error {
  constructor(id: string) {
    super(`photo ${id} wasn't uploaded by this user`);
    this.name = "PhotoNotUploadedError";
  }
}

const toPhoto = (r: typeof recipeImages.$inferSelect): StoredPhoto => ({
  id: r.id,
  origin: r.origin === "import" ? "import" : "upload",
  storagePath: r.storagePath,
  thumbPath: r.thumbPath,
  externalUrl: r.externalUrl,
  width: r.width,
  height: r.height,
  alt: r.alt,
  isCover: r.isCover,
  stepId: r.stepId,
});

export async function photosOf(tx: Tx, recipeId: string): Promise<StoredPhoto[]> {
  const rows = await tx.select().from(recipeImages).where(eq(recipeImages.recipeId, recipeId)).orderBy(asc(recipeImages.position));
  return rows.map(toPhoto);
}

/** The user's photos of a recipe (none when it isn't theirs). */
export async function recipePhotos(db: Db, userId: string, recipeId: string): Promise<StoredPhoto[]> {
  return withUser(db, userId, (tx) => photosOf(tx, recipeId));
}

/**
 * Makes recipe_images match the draft. Call after the steps are written: `stepIds`
 * are the new step rows in draft order. New photos must be checked uploads (or the
 * imported link); anything else throws, so the transaction rolls back.
 */
export async function syncPhotos(tx: Tx, userId: string, recipeId: string, draft: RecipeDraft, stepIds: readonly string[], input: PhotoInput = {}) {
  const plan = planPhotoSync(await photosOf(tx, recipeId), draft);
  if (plan.remove.length) {
    await tx.delete(recipeImages).where(and(eq(recipeImages.recipeId, recipeId), inArray(recipeImages.id, plan.remove)));
  }
  for (const p of plan.insert) {
    if (input.imported?.id === p.id) {
      await tx.insert(recipeImages).values({ id: p.id, recipeId, origin: "import", externalUrl: input.imported.url, alt: p.alt });
    } else {
      if (!input.uploads?.has(p.id) || p.width === null || p.height === null) throw new PhotoNotUploadedError(p.id);
      const paths = photoPaths(userId, p.id);
      await tx.insert(recipeImages).values({
        id: p.id, recipeId, origin: "upload", storagePath: paths.full, thumbPath: paths.thumb, width: p.width, height: p.height, alt: p.alt,
      });
    }
  }
  if (!draft.photos.length) return;
  // clear the cover first: one_cover_per_recipe allows only one at a time
  await tx.update(recipeImages).set({ isCover: false }).where(eq(recipeImages.recipeId, recipeId));
  const stepOf = new Map(plan.stepPhotoIds.flatMap((id, i) => (id ? [[id, stepIds[i]] as const] : [])));
  for (const p of draft.photos) {
    await tx
      .update(recipeImages)
      .set({ isCover: p.id === plan.coverId, stepId: stepOf.get(p.id) ?? null, position: plan.positions.get(p.id) ?? 0, alt: p.alt })
      .where(and(eq(recipeImages.recipeId, recipeId), eq(recipeImages.id, p.id)));
  }
}
