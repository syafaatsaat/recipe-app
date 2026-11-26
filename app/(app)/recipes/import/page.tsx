import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ImportStart } from "@/components/import/import-forms";
import { requireUserId } from "@/lib/auth";

export const metadata: Metadata = { title: "Import a recipe" };

async function Start() {
  await requireUserId();
  return <ImportStart />;
}

export default function ImportPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] leading-tight font-semibold">Import a recipe</h1>
        <Link href="/recipes" className="flex min-h-11 items-center text-[15px] no-underline">
          Cancel
        </Link>
      </div>
      <Suspense fallback={<div className="h-[46px] rounded-full border border-input" />}>
        <Start />
      </Suspense>
    </main>
  );
}
