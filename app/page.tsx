import Link from "next/link";

// proxy.ts sends "/" to /recipes or /login; this only shows if the proxy didn't run.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold">Recipes</h1>
      <Link href="/recipes" className="text-primary underline underline-offset-3">
        Open your recipes
      </Link>
    </main>
  );
}
