"use client";

// The scaled recipe: reads scale + units from the URL (doc §3.5) and renders on the
// client, so a chip tap is instant. URL changes use history.replaceState, which Next
// syncs with useSearchParams: no server round-trip, and Back still leaves the recipe.
import { useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { Fractions } from "@/components/fractions";
import { minutesText } from "@/components/recipes/format";
import { RecipeMenu } from "@/components/recipes/recipe-menu";
import { parseScaleParams, render, sourceSystem, toScaleParams, type RenderInput, type ScaleState, type UnitSystem } from "@/lib/culinary";
import type { PanOption } from "@/db/pans";
import type { RenderLine } from "@/lib/recipes/render-input";
import {
  activeChip, chipScale, factorText, isScaledView, moreLabel, ovenText, scaledYieldText, warningNotes,
} from "@/lib/recipes/scale-view";
import type { RecipeDraft } from "@/lib/recipes/schema";
import { IngredientLine } from "./ingredient-line";
import { ScaleBar } from "./scale-bar";
import { ScaleSheet } from "./scale-sheet";
import { Segmented } from "./segmented";
import { WarningList } from "./warning-list";

const sourceHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const UNIT_OPTIONS = [
  { value: "us", label: "US" },
  { value: "metric", label: "Metric" },
] as const;

export function RecipeView({
  draft,
  lines,
  input,
  pans,
  recipeId,
  versionCount,
  credit = null,
  children,
}: {
  draft: RecipeDraft;
  lines: RenderLine[];
  input: RenderInput;
  pans: PanOption[];
  recipeId: string;
  versionCount: number;
  /** where an imported recipe came from, for the credit line */
  credit?: { url: string | null; name: string | null } | null;
  /** method and footer (server-rendered) */
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const source = sourceSystem(input);
  const parsed = parseScaleParams(params);
  const scale = parsed.scale;
  const units = parsed.units ?? source;
  const [sheetOpen, setSheetOpen] = useState(false);
  const headingId = useId();

  const rendered = render(input, scale, units, { pans });
  // an impossible scale (e.g. a stale pan link) shows the recipe as written, with a note
  const shown = rendered.ok ? rendered : render(input, { mode: "none" }, source);
  const amounts = shown.ok ? shown.ingredients : [];
  const sourcePan = input.pan ? (pans.find((p) => p.id === input.pan!.id) ?? null) : null;
  const targetPan = rendered.ok && scale.mode === "pan" ? (pans.find((p) => p.id === scale.targetPanId) ?? null) : null;
  const notes = warningNotes(rendered, input, { source: input.pan, target: targetPan });
  const effective: ScaleState = rendered.ok ? scale : { mode: "none" };

  function setView(next: ScaleState, nextUnits: UnitSystem) {
    // the source system is the default, so it stays out of the URL
    const p = toScaleParams(next, nextUnits === source ? null : nextUnits);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const yieldText = scaledYieldText(draft.yieldQty, draft.yieldUnit, shown.ok ? shown.factor : 1, effective.mode);
  const panLabel = (targetPan ?? sourcePan)?.label;
  const times = [
    draft.prepMin !== null && `Prep ${minutesText(draft.prepMin)}`,
    draft.cookMin !== null && `Cook ${minutesText(draft.cookMin)}`,
    draft.ovenTempC !== null && `Oven ${ovenText(draft.ovenTempC, units, draft.ovenUnit)}`,
  ].filter(Boolean);

  return (
    <article className="flex flex-col">
      <div className="flex items-start justify-between gap-2 px-6">
        <h1 className="pt-2 text-[30px] leading-tight font-semibold">{draft.title}</h1>
        <RecipeMenu id={recipeId} title={draft.title} versionCount={versionCount} />
      </div>
      <div className="flex flex-col gap-1 px-6 pt-2 text-sm text-muted-foreground">
        {(yieldText || panLabel) && (
          <p>
            {yieldText && (
              <>
                Makes <span className="font-mono text-foreground"><Fractions text={yieldText} /></span>
              </>
            )}
            {yieldText && panLabel && " · "}
            {panLabel}
          </p>
        )}
        {times.length > 0 && <p className="font-mono text-[13px]">{times.join(" · ")}</p>}
        {credit?.url && (
          <p className="text-[13px]">
            <a href={credit.url} target="_blank" rel="noopener noreferrer nofollow" className="text-muted-foreground">
              From {credit.name ?? sourceHost(credit.url)} ↗
            </a>
          </p>
        )}
        {draft.description && <p className="pt-2 text-[15px] leading-relaxed text-foreground">{draft.description}</p>}
      </div>

      <ScaleBar
        active={activeChip(effective)}
        factor={factorText(shown.ok ? shown.factor : 1)}
        moreLabel={moreLabel(effective, pans)}
        onChip={(f) => setView(chipScale(f), units)}
        onMore={() => setSheetOpen(true)}
      >
        <div className="flex items-center justify-between">
          <Segmented label="Units" options={UNIT_OPTIONS} value={units} onChange={(u) => setView(scale, u)} />
          {isScaledView(scale, units, source) && (
            <button
              type="button"
              onClick={() => setView({ mode: "none" }, source)}
              className="h-11 text-sm font-medium text-primary underline underline-offset-[3px]"
            >
              Reset to original
            </button>
          )}
        </div>
      </ScaleBar>
      <WarningList notes={notes} />

      <section className="px-6 pt-7" aria-labelledby={headingId}>
        <h2 id={headingId} className="mb-1.5 text-xl font-medium">
          Ingredients
        </h2>
        {draft.sections.map((s, si) => (
          <div key={si} className="pt-1">
            {s.title && (
              <h3 className="pt-4 pb-1 font-sans text-xs tracking-[0.12em] text-muted-foreground uppercase">{s.title}</h3>
            )}
            <ul>
              {lines.map((l, i) => (l.sectionIndex !== si ? null : <IngredientLine key={l.id} line={l} amount={amounts[i]} />))}
            </ul>
          </div>
        ))}
        {lines.length === 0 && <p className="py-3 text-[15px] text-muted-foreground">No ingredients yet.</p>}
      </section>

      {children}

      <ScaleSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        input={input}
        draft={draft}
        pans={pans}
        scale={effective}
        onApply={(next) => {
          setView(next, units);
          setSheetOpen(false);
        }}
      />
    </article>
  );
}
