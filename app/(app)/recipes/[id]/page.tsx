import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { RecipeView } from "@/components/recipes/view/recipe-view";
import { listPans } from "@/db/pans";
import { getRecipe } from "@/db/recipes";
import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { toRenderInput, toRenderLines } from "@/lib/recipes/render-input";

export const metadata: Metadata = { title: "Recipe" };

async function load(params: PageProps<"/recipes/[id]">["params"]) {
  const userId = await requireUserId();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const [recipe, pans] = await Promise.all([getRecipe(db, userId, id), listPans(db, userId)]);
  if (!recipe) notFound(); // also for other people's recipes: RLS hides them
  return { recipe, pans, pan: pans.find((p) => p.id === recipe.draft.panId) ?? null };
}

async function Recipe({ params }: { params: PageProps<"/recipes/[id]">["params"] }) {
  const { recipe, pan, pans } = await load(params);
  const { draft } = recipe;
  const lines = toRenderLines(draft, recipe.catalog);
  const input = toRenderInput(draft, lines, pan);

  return (
    <RecipeView
      draft={draft}
      lines={lines}
      input={input}
      pans={pans}
      recipeId={recipe.id}
      versionCount={recipe.versionCount}
    >
      <div>
        {draft.steps.length > 0 && (
          <section className="px-6 pt-8" aria-labelledby="method">
            <h2 id="method" className="mb-3.5 text-xl font-medium">
              Method
            </h2>
            <ol className="flex flex-col gap-4 text-[15px] leading-relaxed">
              {draft.steps.map((s, i) => (
                <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)]">
                  <span className="font-mono text-primary">{i + 1}</span>
                  <span className="whitespace-pre-line">{s.body}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
        <p className="px-6 pt-8 pb-12 text-xs text-muted-foreground">
          Version {recipe.versionNo} · updated {new Date(recipe.updatedAt).toLocaleDateString("en", { dateStyle: "medium" })}
        </p>
      </div>
    </RecipeView>
  );
}

export default function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  return (
    <main>
      <Suspense fallback={<div className="mx-6 mt-4 h-9 w-2/3 rounded bg-muted" />}>
        <Recipe params={params} />
      </Suspense>
    </main>
  );
}
