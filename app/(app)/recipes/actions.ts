"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addMyIngredient, matchIngredient, searchIngredients } from "@/db/ingredients";
import { createRecipe, deleteRecipe, updateRecipe } from "@/db/recipes";
import { endMissingAccount, isMissingAccount, requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import type { CatalogIngredient } from "@/lib/recipes/render-input";
import { recipeDraftSchema } from "@/lib/recipes/schema";

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
  const db = getDb();
  let target: string;
  try {
    if (id === null) {
      target = await createRecipe(db, userId, parsed.data);
    } else {
      if (!z.uuid().safeParse(id).success) return { error: "That recipe doesn’t exist." };
      const v = await updateRecipe(db, userId, id, parsed.data);
      if (v === null) return { error: "That recipe doesn’t exist or isn’t yours." };
      target = id;
    }
  } catch (e) {
    if (isMissingAccount(e)) await endMissingAccount();
    console.error("saveRecipe failed", e);
    return { error: "Couldn’t save. Check the ingredients you linked and try again." };
  }
  revalidatePath("/recipes");
  redirect(`/recipes/${target}`);
}

export async function removeRecipe(id: string): Promise<{ error: string } | void> {
  const userId = await requireUserId();
  if (!z.uuid().safeParse(id).success || !(await deleteRecipe(getDb(), userId, id))) {
    return { error: "That recipe doesn’t exist or isn’t yours." };
  }
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
