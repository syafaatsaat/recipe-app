import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { RecipeEditor } from "@/components/recipes/editor/recipe-editor";
import { listPans } from "@/db/pans";
import { getRecipe } from "@/db/recipes";
import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { photoUrls } from "@/lib/photos/storage";
import { newLine, toEditorState } from "@/lib/recipes/editor-state";

export const metadata: Metadata = { title: "Edit recipe" };

async function Editor({ params }: { params: PageProps<"/recipes/[id]/edit">["params"] }) {
  const userId = await requireUserId();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const [recipe, pans] = await Promise.all([getRecipe(db, userId, id), listPans(db, userId)]);
  if (!recipe) notFound();
  const initial = toEditorState(recipe.draft, recipe.catalog, await photoUrls(recipe.photos));
  if (initial.sections.every((s) => s.lines.length === 0)) initial.sections[0].lines = [newLine()];
  return <RecipeEditor recipeId={recipe.id} versionNo={recipe.versionNo} initial={initial} pans={pans} userId={userId} />;
}

export default function EditRecipePage({ params }: PageProps<"/recipes/[id]/edit">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <Editor params={params} />
      </Suspense>
    </main>
  );
}
