import { Suspense } from "react";
import { requireUserId } from "@/lib/auth";

async function Placeholder() {
  await requireUserId();
  return <p className="text-muted-foreground">Signed in. The recipe list arrives in step 6.</p>;
}

export default function RecipesPage() {
  return (
    <main className="flex flex-col gap-4 px-6 py-4">
      <h1 className="text-3xl font-semibold">Recipes</h1>
      <Suspense>
        <Placeholder />
      </Suspense>
    </main>
  );
}
