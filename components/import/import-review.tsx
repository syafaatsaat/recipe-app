"use client";

// The import review screen (doc §8, canvas WfImport): every line shows the text it
// came from next to how it was read; low-confidence lines are flagged with a
// one-tap fix. Importing doesn't wait for every flag: fix the rest in the editor.
import { X } from "lucide-react";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { cn } from "cn";
import { confirmImport } from "@/app/(app)/recipes/import/actions";
import { yieldText } from "@/components/recipes/format";
import { Button } from "@/components/ui/button";
import { formatNumberFor, formatRange, unitLabel } from "@/lib/culinary/format";
import { lineKey, reviewedDraft, type ImportSource } from "@/lib/import/draft";
import { FLAG_BELOW, type ParsedLine } from "@/lib/import/parse-line";
import type { RecipeDraft } from "@/lib/recipes/schema";
import { PasteForm } from "./import-forms";

type Line = RecipeDraft["sections"][number]["ingredients"][number];

const CHIP = "inline-flex min-h-8 items-center rounded-2xl px-[11px] text-[13.5px]";
const CHIPS = {
  qty: cn(CHIP, "border border-input/60 bg-card font-mono font-medium"),
  unit: cn(CHIP, "border border-input/60 bg-card"),
  ok: cn(CHIP, "border border-primary bg-accent"),
  miss: cn(CHIP, "border border-dashed border-destructive bg-card text-destructive"),
  prep: cn(CHIP, "border border-transparent text-muted-foreground italic"),
};

const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.host + u.pathname).replace(/^www\./, "").replace(/\/$/, "");
  } catch {
    return url;
  }
};

function FetchRow({ url, state }: { url: string | null; state: "Read" | "Pasted" | "Failed" }) {
  return (
    <div className="flex h-[46px] items-center gap-2 rounded-full border border-input/60 bg-card px-4">
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{hostOf(url) ?? "Pasted text"}</span>
      <span className={cn("text-[13px] font-medium", state === "Failed" ? "text-destructive" : "text-primary")}>{state}</span>
    </div>
  );
}

function TopBar() {
  return (
    <div className="flex items-center justify-between">
      <Link href="/recipes" className="flex min-h-11 items-center text-[15px] no-underline">
        Cancel
      </Link>
    </div>
  );
}

/** A link import that found no recipe: the canvas's paste fallback. */
export function FailedImport({ jobId, url, error }: { jobId: string; url: string | null; error: string | null }) {
  return (
    <div className="flex flex-col gap-4 px-6 pt-3 pb-12">
      <TopBar />
      <FetchRow url={url} state="Failed" />
      <div className="flex flex-col gap-1 border-b border-border pt-1 pb-2 text-sm leading-[1.45] text-destructive" role="alert">
        <p>Couldn’t read a recipe from that page. Some sites block apps, or have no recipe data.</p>
        {error && <p className="text-[13px] text-muted-foreground">{error}</p>}
      </div>
      <PasteForm fromJob={jobId} label="Paste the text instead" />
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="-mt-2 -mr-2.5 flex size-11 flex-none items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <X className="size-[18px]" strokeWidth={1.8} aria-hidden />
    </button>
  );
}

/** A removed line or step stays in place, struck through, so a slip is one tap to undo. */
function Removed({ text, what, onUndo, className }: { text: string; what: string; onUndo: () => void; className?: string }) {
  return (
    <li data-removed className={cn("flex items-center gap-2 border-b border-border py-2", className)}>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground line-through">{text}</span>
      <span className="sr-only">{what} removed.</span>
      <button type="button" onClick={onUndo} className="flex min-h-11 items-center px-1 text-sm font-medium text-primary">
        Undo
      </button>
    </li>
  );
}

function amountChips(l: Line): { text: string; kind: keyof typeof CHIPS }[] {
  if (l.quantity === null) return [];
  const qty = l.quantityMax !== null ? formatRange(l.quantity, l.quantityMax, null) : formatNumberFor(l.quantity, l.unitCode);
  const out: { text: string; kind: keyof typeof CHIPS }[] = [{ text: qty, kind: "qty" }];
  if (l.unitCode) out.push({ text: unitLabel(l.unitCode, l.quantityMax ?? l.quantity), kind: "unit" });
  return out;
}

function ReviewLine({
  line,
  parse,
  match,
  accepted,
  onAccept,
  onRemove,
}: {
  line: Line;
  parse: ParsedLine;
  match: string | null;
  accepted: boolean;
  onAccept: () => void;
  onRemove: () => void;
}) {
  const low = parse.confidence < FLAG_BELOW && !accepted;
  const chips = [
    ...amountChips(line),
    match ? { text: `${line.name} ✓`, kind: "ok" as const } : { text: `${line.name} ?`, kind: "miss" as const },
    ...(line.preparation ? [{ text: line.preparation, kind: "prep" as const }] : []),
    ...(line.note ? [{ text: line.note, kind: "prep" as const }] : []),
    ...(line.isOptional ? [{ text: "optional", kind: "prep" as const }] : []),
  ];
  return (
    <li
      data-flagged={low || undefined}
      className={cn(
        "border-b border-border py-3",
        low && "-mx-3 border-l-2 border-l-destructive bg-warning-muted px-3",
      )}
    >
      {low && (
        <p className="mb-1.5 flex justify-between text-xs text-destructive">
          <span>Check this one</span>
          <span className="font-mono">{parse.confidence.toFixed(2)}</span>
        </p>
      )}
      <div className="mb-2 flex items-start gap-2">
        <p className="min-w-0 flex-1 font-mono text-xs leading-snug text-muted-foreground">{parse.raw}</p>
        <RemoveButton label={`Remove ingredient: ${parse.raw}`} onClick={onRemove} />
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Read as">
        {chips.map((c, i) => (
          <span key={i} className={CHIPS[c.kind]}>
            {c.text}
          </span>
        ))}
      </div>
      {parse.info.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{parse.info.join(" · ")}</p>}
      {!match && <p className="mt-2 text-xs text-muted-foreground">Not in your ingredients yet, so it can’t show grams. Match it in the editor.</p>}
      {low && parse.fix && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <p className="flex-1 text-[13px] leading-[1.4]">{parse.fix.text}</p>
          <Button
            type="button"
            variant="outline"
            onClick={onAccept}
            className="h-10 rounded-full border-primary px-4 whitespace-nowrap text-primary hover:bg-accent"
          >
            {parse.fix.label}
          </Button>
        </div>
      )}
    </li>
  );
}

export function ImportReview({
  jobId,
  draft,
  parsed,
  matched,
  source,
  fetchedUrl,
  duplicate,
}: {
  jobId: string;
  draft: RecipeDraft;
  parsed: ParsedLine[][];
  matched: (string | null)[][];
  source: ImportSource;
  fetchedUrl: string | null;
  duplicate: { id: string; title: string; createdAt: string } | null;
}) {
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const [removedLines, setRemovedLines] = useState<Set<string>>(() => new Set());
  const [removedSteps, setRemovedSteps] = useState<Set<number>>(() => new Set());
  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };
  const [showSteps, setShowSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  const keys = parsed.flatMap((sec, si) => sec.map((p, li) => ({ key: lineKey(si, li), p })));
  const kept = keys.filter(({ key }) => !removedLines.has(key));
  const flagged = kept.filter(({ key, p }) => p.confidence < FLAG_BELOW && !accepted.has(key)).length;
  const lineCount = kept.length;
  const stepCount = draft.steps.length - removedSteps.size;
  const made = yieldText(draft.yieldQty, draft.yieldUnit);
  const site = source.siteName ?? hostOf(source.url);

  const doImport = () => {
    setError(null);
    const out = reviewedDraft(draft, { accepted, removedLines, removedSteps });
    startTransition(async () => {
      const r = await confirmImport(jobId, out);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-4 px-6 pt-3 pb-36">
      <TopBar />
      <FetchRow url={fetchedUrl ?? source.url} state={source.method === "paste" ? "Pasted" : "Read"} />

      <section className="flex items-center gap-3.5 border-b border-border pb-4" aria-labelledby={`${uid}title`}>
        <div aria-hidden className="grain size-[76px] flex-none rounded-[4px_14px_6px_12px]" />
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h1 id={`${uid}title`} className="text-xl leading-tight font-semibold">
            {draft.title}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {[site ? `From ${site}` : "From pasted text", made].filter(Boolean).join(" · ")}
          </p>
          {source.url && (
            <p className="text-xs leading-snug text-muted-foreground">The photo stays on their site, and the credit stays with the recipe.</p>
          )}
        </div>
      </section>

      {duplicate && (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-snug">
          You imported this on {new Date(duplicate.createdAt).toLocaleDateString("en", { dateStyle: "medium" })}.{" "}
          <Link href={`/recipes/${duplicate.id}`}>Open “{duplicate.title}”</Link>, or import it again as a new recipe.
        </p>
      )}

      <section aria-labelledby={`${uid}ing`} className="flex flex-col">
        <div className="flex items-baseline justify-between">
          <h2 id={`${uid}ing`} className="text-lg font-medium">
            Check the ingredients
          </h2>
          <span className={cn("text-[13px]", flagged ? "text-destructive" : "text-primary")}>
            {lineCount === 0 ? "None found" : flagged ? `${flagged} to check` : "All checked"}
          </span>
        </div>
        {draft.sections.map((s, si) => (
          <div key={si} className="flex flex-col">
            {s.title && draft.sections.length > 1 && (
              <h3 className="pt-4 text-xs tracking-[0.12em] text-muted-foreground uppercase">{s.title}</h3>
            )}
            <ul className="flex flex-col">
              {s.ingredients.map((l, li) => {
                const key = lineKey(si, li);
                return removedLines.has(key) ? (
                  <Removed key={li} text={parsed[si][li].raw} what="Ingredient" onUndo={() => setRemovedLines((r) => toggle(r, key))} />
                ) : (
                  <ReviewLine
                    key={li}
                    line={l}
                    parse={parsed[si][li]}
                    match={matched[si][li]}
                    accepted={accepted.has(key)}
                    onAccept={() => setAccepted((a) => new Set(a).add(key))}
                    onRemove={() => setRemovedLines((r) => toggle(r, key))}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby={`${uid}method`} className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-y border-border py-3.5">
          <h2 id={`${uid}method`} className="text-lg font-medium">
            Method · {stepCount} {stepCount === 1 ? "step" : "steps"}
          </h2>
          {draft.steps.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSteps((v) => !v)}
              aria-expanded={showSteps}
              aria-controls={`${uid}steps`}
              className="flex min-h-11 items-center text-sm text-muted-foreground"
            >
              {showSteps ? "Hide" : "Looks fine. Show"}
            </button>
          )}
        </div>
        {showSteps && (
          <ol id={`${uid}steps`} className="flex flex-col text-[15px] leading-relaxed">
            {draft.steps.map((st, i) => {
              if (removedSteps.has(i)) {
                return <Removed key={i} text={st.body} what="Step" onUndo={() => setRemovedSteps((r) => toggle(r, i))} />;
              }
              const n = i + 1 - [...removedSteps].filter((r) => r < i).length;
              return (
                <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-1 border-b border-border py-2.5">
                  <span className="font-mono text-primary">{n}</span>
                  <span>{st.body}</span>
                  <RemoveButton label={`Remove step ${n}`} onClick={() => setRemovedSteps((r) => toggle(r, i))} />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card">
        <div className="mx-auto flex max-w-xl items-center gap-3.5 px-6 pt-3 pb-5">
          <p className={cn("flex-1 text-[13px] leading-[1.4]", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
            {error ??
              (flagged
                ? `${flagged} ${flagged === 1 ? "line" : "lines"} still flagged. You can import now and fix them later.`
                : source.url
                  ? "Saved as version 1, with the source link."
                  : "Saved as version 1.")}
          </p>
          <Button type="button" size="lg" onClick={doImport} disabled={pending} className="h-12 rounded-3xl px-6">
            {pending ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
