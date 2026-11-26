import type { Metadata } from "next";
import { Suspense } from "react";
import { RecipeEditor } from "@/components/recipes/editor/recipe-editor";
import { listPans } from "@/db/pans";
import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { newLine, toEditorState } from "@/lib/recipes/editor-state";
import { emptyDraft } from "@/lib/recipes/schema";

export const metadata: Metadata = { title: "New recipe" };

async function Editor() {
  const userId = await requireUserId();
  const pans = await listPans(getDb(), userId);
  const initial = toEditorState(emptyDraft(), {});
  initial.sections[0].lines = [newLine(), newLine(), newLine()];
  initial.steps = [{ key: "t-first", body: "" }];
  return <RecipeEditor recipeId={null} versionNo={0} initial={initial} pans={pans} />;
}

export default function NewRecipePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <Editor />
      </Suspense>
    </main>
  );
}
