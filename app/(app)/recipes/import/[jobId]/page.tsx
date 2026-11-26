import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { FailedImport, ImportReview } from "@/components/import/import-review";
import { findBySourceUrl, getImportJob } from "@/db/imports";
import { matchMany } from "@/db/ingredients";
import { requireUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { importedLine, toImportDraft } from "@/lib/import/draft";
import { extractedRecipeSchema } from "@/lib/import/extract";
import { ingredientCandidates } from "@/lib/import/parse-line";

export const metadata: Metadata = { title: "Check the import" };

async function Review({ params }: { params: PageProps<"/recipes/import/[jobId]">["params"] }) {
  const userId = await requireUserId();
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) notFound();
  const db = getDb();
  const job = await getImportJob(db, userId, jobId);
  if (!job) notFound(); // also other people's jobs: RLS hides them
  if (job.recipeId) redirect(`/recipes/${job.recipeId}`);

  const payload = extractedRecipeSchema.safeParse(job.rawPayload);
  if (job.status === "failed" || !payload.success) {
    return <FailedImport jobId={job.id} url={job.url} error={job.error} />;
  }

  // the parse isn't stored: re-derive it, so parser fixes reach pending reviews too
  const imp = toImportDraft(payload.data);
  const lines = imp.draft.sections.flatMap((s) => s.ingredients);
  // AI readings of flagged lines (doc §3.11), matched to the catalog like the lines are
  const hinted = imp.parsed.flatMap((sec) => sec.flatMap((p) => (p.suggestion ? [importedLine({ ...p, fields: p.suggestion, confidence: 1, fix: null })] : [])));
  const [hits, duplicate] = await Promise.all([
    matchMany(db, userId, [...lines, ...hinted].map((l) => ingredientCandidates(l.name))),
    imp.source.url ? findBySourceUrl(db, userId, imp.source.url) : null,
  ]);
  let n = 0;
  const matched: (string | null)[][] = imp.draft.sections.map((s) =>
    s.ingredients.map((l) => {
      const hit = hits[n++];
      l.ingredientId = hit?.id ?? null;
      return hit?.name ?? null;
    }),
  );
  let h = 0;
  const suggestions = imp.parsed.map((sec) =>
    sec.map((p) => {
      if (!p.suggestion) return null;
      const line = hinted[h];
      const hit = hits[lines.length + h++];
      line.ingredientId = hit?.id ?? null;
      return { line, match: hit?.name ?? null, matchId: hit?.id ?? null };
    }),
  );

  return (
    <ImportReview
      jobId={job.id}
      draft={imp.draft}
      parsed={imp.parsed}
      matched={matched}
      suggestions={suggestions}
      source={imp.source}
      fetchedUrl={job.url}
      duplicate={duplicate}
    />
  );
}

export default function ImportReviewPage({ params }: PageProps<"/recipes/import/[jobId]">) {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense fallback={<div className="mx-6 mt-4 h-[76px] rounded-xl bg-muted" />}>
        <Review params={params} />
      </Suspense>
    </main>
  );
}
