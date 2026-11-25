import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { minutesText, ovenText, yieldText } from "@/components/recipes/format";
import { RecipeMenu } from "@/components/recipes/recipe-menu";
import { listPans } from "@/db/pans";
import { getRecipe } from "@/db/recipes";
import { render, sourceSystem } from "@/lib/culinary";
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
  return { recipe, pan: pans.find((p) => p.id === recipe.draft.panId) ?? null };
}

async function Recipe({ params }: { params: PageProps<"/recipes/[id]">["params"] }) {
  const { recipe, pan } = await load(params);
  const { draft } = recipe;
  const lines = toRenderLines(draft, recipe.catalog);
  const input = toRenderInput(draft, lines, pan);
  // M3 shows the recipe as entered (factor 1, its own unit system). Scaling is M4.
  const rendered = render(input, { mode: "none" }, sourceSystem(input));
  const amounts = rendered.ok ? rendered.ingredients : [];

  const meta = [
    yieldText(draft.yieldQty, draft.yieldUnit) && `Makes ${yieldText(draft.yieldQty, draft.yieldUnit)}`,
    pan?.label,
  ].filter(Boolean);
  const times = [
    draft.prepMin !== null && `Prep ${minutesText(draft.prepMin)}`,
    draft.cookMin !== null && `Cook ${minutesText(draft.cookMin)}`,
    draft.ovenTempC !== null && `Oven ${ovenText(draft.ovenTempC)}`,
  ].filter(Boolean);

  return (
    <article className="flex flex-col">
      <div className="flex items-start justify-between gap-2 px-6">
        <h1 className="pt-2 text-[30px] leading-tight font-semibold">{draft.title}</h1>
        <RecipeMenu id={recipe.id} title={draft.title} versionCount={recipe.versionCount} />
      </div>
      <div className="flex flex-col gap-1 px-6 pt-2 text-sm text-muted-foreground">
        {meta.length > 0 && <p>{meta.join(" · ")}</p>}
        {times.length > 0 && <p className="font-mono text-[13px]">{times.join(" · ")}</p>}
        {draft.description && <p className="pt-2 text-[15px] leading-relaxed text-foreground">{draft.description}</p>}
      </div>

      <section className="px-6 pt-7" aria-labelledby="ingredients">
        <h2 id="ingredients" className="mb-1.5 text-xl font-medium">
          Ingredients
        </h2>
        {draft.sections.map((s, si) => (
          <div key={si} className="pt-1">
            {s.title && <h3 className="pt-4 pb-1 font-sans text-xs tracking-[0.12em] text-muted-foreground uppercase">{s.title}</h3>}
            <ul>
              {lines.map((l, i) =>
                l.sectionIndex !== si ? null : (
                  <li key={l.id} className="grid grid-cols-[136px_minmax(0,1fr)] gap-3 border-b border-border/70 py-3 text-[15px] leading-snug">
                    <span className={amounts[i]?.amount ? "font-mono text-[14.5px] font-medium" : "font-mono text-[14.5px] text-muted-foreground"}>
                      {amounts[i]?.amount ?? "to taste"}
                    </span>
                    <span>
                      {!amounts[i]?.amountIncludesName && l.input.name}
                      {l.input.preparation && <span className="text-muted-foreground">, {l.input.preparation}</span>}
                      {l.isOptional && <span className="text-muted-foreground"> (optional)</span>}
                      {l.note && <span className="block text-[13px] text-muted-foreground">{l.note}</span>}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
        {lines.length === 0 && <p className="py-3 text-[15px] text-muted-foreground">No ingredients yet.</p>}
      </section>

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
    </article>
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
