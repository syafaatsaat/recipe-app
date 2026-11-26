"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addMyIngredient, matchIngredient, searchIngredients } from "@/db/ingredients";
import { PhotoNotUploadedError, recipePhotos } from "@/db/photos";
import { createRecipe, deleteRecipe, updateRecipe } from "@/db/recipes";
import { endMissingAccount, isMissingAccount, requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { planPhotoSync } from "@/lib/photos/photos";
import { removeObjects, uploadsExist } from "@/lib/photos/storage";
import type { CatalogIngredient } from "@/lib/recipes/render-input";
import { recipeDraftSchema } from "@/lib/recipes/schema";

const PHOTO_MISSING = "A photo didn’t finish uploading. Remove it and add it again.";

export type SaveResult = { error: string; issues?: { path: string; message: string }[] };

/** Create (id null) or update. On success redirects to the recipe; otherwise returns what's wrong. */
export async function saveRecipe(id: string | null, input: unknown): Promise<SaveResult> {
  const userId = await requireUserId();
  const parsed = recipeDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Some fields need fixing.",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  if (id !== null && !z.uuid().safeParse(id).success) return { error: "That recipe doesn’t exist." };
  const db = getDb();
  let target: string;
  let removePaths: string[];
  try {
    // new photos must be uploads in the user's own folder (doc §3.12); dropped ones go after the save
    const plan = planPhotoSync(id === null ? [] : await recipePhotos(db, userId, id), parsed.data);
    const added = plan.insert.map((p) => p.id);
    if (!(await uploadsExist(userId, added))) return { error: PHOTO_MISSING };
    removePaths = plan.removePaths;
    const photos = { uploads: new Set(added) };
    if (id === null) {
      target = await createRecipe(db, userId, parsed.data, undefined, photos);
    } else {
      const v = await updateRecipe(db, userId, id, parsed.data, null, photos);
      if (v === null) return { error: "That recipe doesn’t exist or isn’t yours." };
      target = id;
    }
  } catch (e) {
    // by name too: a server action and the db module can load as separate instances in dev
    if (e instanceof PhotoNotUploadedError || (e instanceof Error && e.name === "PhotoNotUploadedError")) return { error: PHOTO_MISSING };
    if (isMissingAccount(e)) await endMissingAccount();
    console.error("saveRecipe failed", e);
    return { error: "Couldn’t save. Check the ingredients you linked and try again." };
  }
  await removeObjects(removePaths);
  revalidatePath("/recipes");
  redirect(`/recipes/${target}`);
}

export async function removeRecipe(id: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  if (!z.uuid().safeParse(id).success) return { error: "That recipe doesn’t exist or isn’t yours." };
  const db = getDb();
  // the rows go with the recipe (cascade); the uploaded files are removed after
  const files = (await recipePhotos(db, userId, id)).flatMap((p) => [p.storagePath, p.thumbPath].filter((x): x is string => !!x));
  if (!(await deleteRecipe(db, userId, id))) return { error: "That recipe doesn’t exist or isn’t yours." };
  await removeObjects(files);
  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function findIngredients(text: string): Promise<CatalogIngredient[]> {
  const userId = await requireUserId();
  const q = z.string().max(100).safeParse(text);
  return q.success ? searchIngredients(getDb(), userId, q.data) : [];
}

export async function exactIngredient(text: string): Promise<CatalogIngredient | null> {
  const userId = await requireUserId();
  const q = z.string().max(200).safeParse(text);
  return q.success ? matchIngredient(getDb(), userId, q.data) : null;
}

const addSchema = z.object({
  name: z.string().trim().min(1, "Name it.").max(200),
  gramsPerCup: z.number().positive("Must be more than 0.").lt(2000, "That’s heavier than any ingredient.").nullable(),
});

export async function addIngredient(
  input: unknown,
): Promise<{ ok: true; ingredient: CatalogIngredient } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    return { ok: true, ingredient: await addMyIngredient(getDb(), userId, parsed.data) };
  } catch (e) {
    if (isMissingAccount(e)) await endMissingAccount();
    console.error("addIngredient failed", e);
    return { ok: false, error: "Couldn’t add it. Try again." };
  }
}
