import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NewRecipeMenu } from "@/components/recipes/new-recipe-menu";
import { yieldText } from "@/components/recipes/format";
import { SearchField } from "@/components/recipes/search-field";
import { Button } from "@/components/ui/button";
import { listRecipes } from "@/db/recipes";
import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "Your recipes" };

async function RecipeList({ searchParams }: { searchParams: PageProps<"/recipes">["searchParams"] }) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const recipes = await listRecipes(getDb(), userId, q);

  if (recipes.length === 0 && !q) return <EmptyState />;
  if (recipes.length === 0) {
    return <p className="py-6 text-[15px] text-muted-foreground">No recipes match “{q}”.</p>;
  }
  return (
    <ul className="flex flex-col">
      {recipes.map((r) => (
        <li key={r.id}>
          <Link href={`/recipes/${r.id}`} className="group flex items-center gap-3.5 border-b border-border py-3.5 no-underline">
            <div
              aria-hidden
              className="flex size-[76px] flex-none items-center justify-center rounded-[4px_14px_6px_12px] border border-dashed border-input/60 font-heading text-[26px] text-muted-foreground"
            >
              {r.title.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-heading text-lg leading-tight font-medium group-hover:text-primary">{r.title}</span>
              <span className="text-[13px] text-muted-foreground">
                {[yieldText(r.yieldQty, r.yieldUnit), r.panLabel].filter(Boolean).join(" · ") || " "}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 pt-10 text-center">
      <div aria-hidden className="grain size-[120px] rounded-[40px_60px_48px_56px]" />
      <h2 className="mt-3 text-2xl font-medium">No recipes yet</h2>
      <p className="max-w-[280px] text-[15px] text-muted-foreground">
        Import one from a link or pasted text, or write your own.
      </p>
      <Button asChild size="lg" className="mt-3 w-full">
        <Link href="/recipes/import">Import a recipe</Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="w-full">
        <Link href="/recipes/new">Write a recipe</Link>
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3.5 border-b border-border py-3.5">
          <div className="size-[76px] rounded-[4px_14px_6px_12px] bg-muted" />
          <div className="h-4 w-40 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  return (
    <main className="flex flex-col gap-5 px-6 pt-2 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Recipes</h1>
        <NewRecipeMenu />
      </div>
      <Suspense fallback={<div className="h-11 rounded-full border border-input bg-card" />}>
        <SearchField />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <RecipeList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
