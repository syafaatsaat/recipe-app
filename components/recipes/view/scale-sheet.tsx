"use client";

// "More" → the Scale recipe sheet (doc §8): Factor / Yield / Pan tabs. Yield and pan
// are mutually exclusive; whichever is applied last wins (doc §5).
import { cn } from "cn";
import { Fractions } from "@/components/fractions";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import type { PanOption } from "@/db/pans";
import { resolveFactor, type RenderInput, type ScaleState } from "@/lib/culinary";
import {
  depthApplies, factorText, panOptions, parseFactorInput, parseYieldInput, UI_MAX_FACTOR, UI_MIN_FACTOR,
  type PanOptionView,
} from "@/lib/recipes/scale-view";
import type { RecipeDraft } from "@/lib/recipes/schema";
import { PanDiagram } from "./pan-diagram";
import { Segmented } from "./segmented";

type Tab = "factor" | "yield" | "pan";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: RenderInput;
  draft: RecipeDraft;
  pans: PanOption[];
  scale: ScaleState;
  onApply: (next: ScaleState) => void;
}

export function ScaleSheet({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-foreground/40 supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-[22px] bg-card px-6 pt-2.5 pb-7 text-card-foreground outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom"
        >
          {/* mounted only while open, so each opening starts from the current scale */}
          <SheetBody {...rest} />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function SheetBody({ input, draft, pans, scale, onApply }: Omit<Props, "open" | "onOpenChange">) {
  const id = useId();
  const tabs: { value: Tab; label: string; controls: string }[] = [
    { value: "factor", label: "Factor", controls: `${id}-factor` },
    ...(draft.yieldQty !== null ? [{ value: "yield" as const, label: "Yield", controls: `${id}-yield` }] : []),
    ...(input.pan ? [{ value: "pan" as const, label: "Pan", controls: `${id}-pan` }] : []),
  ];
  const initialTab: Tab =
    scale.mode === "factor" || scale.mode === "yield" || scale.mode === "pan" ? scale.mode : input.pan ? "pan" : draft.yieldQty !== null ? "yield" : "factor";
  const [tab, setTab] = useState<Tab>(tabs.some((t) => t.value === initialTab) ? initialTab : "factor");

  const [factorTextValue, setFactorText] = useState(scale.mode === "factor" ? String(scale.factor) : "");
  const [yieldTextValue, setYieldText] = useState(String(scale.mode === "yield" ? scale.targetQty : (draft.yieldQty ?? "")));
  const [panId, setPanId] = useState(scale.mode === "pan" ? scale.targetPanId : (input.pan?.id ?? ""));
  const [useDepth, setUseDepth] = useState(scale.mode === "pan" && scale.useDepth);
  const [showErrors, setShowErrors] = useState(false);

  const factorParsed = parseFactorInput(factorTextValue);
  const yieldParsed = parseYieldInput(yieldTextValue);
  const yieldResolved = yieldParsed.ok ? resolveFactor(input, { mode: "yield", targetQty: yieldParsed.qty }) : null;
  const yieldError = !yieldParsed.ok
    ? yieldParsed.error
    : yieldResolved && !yieldResolved.ok
      ? "That’s more than 100 times the recipe. Try a smaller number."
      : null;

  const source = input.pan;
  const target = pans.find((p) => p.id === panId) ?? null;
  const showDepth = source !== null && depthApplies(source, target);
  const options = source ? panOptions(source, pans, showDepth && useDepth) : [];

  function apply() {
    if (tab === "factor") {
      if (!factorParsed.ok) return setShowErrors(true);
      return onApply(factorParsed.factor === 1 ? { mode: "none" } : { mode: "factor", factor: factorParsed.factor });
    }
    if (tab === "yield") {
      if (!yieldParsed.ok || yieldError) return setShowErrors(true);
      return onApply(yieldParsed.qty === draft.yieldQty ? { mode: "none" } : { mode: "yield", targetQty: yieldParsed.qty });
    }
    if (!source || panId === source.id) return onApply({ mode: "none" });
    onApply({ mode: "pan", targetPanId: panId, useDepth: showDepth && useDepth });
  }

  const inputBox =
    "h-[46px] w-full rounded-[10px] border border-input bg-background px-3 font-mono text-[17px] font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

  return (
    <>
      <div aria-hidden className="h-1 w-10 self-center rounded-full bg-border" />
      <div className="flex items-center justify-between">
        <DialogPrimitive.Title className="font-heading text-[22px] font-medium">Scale recipe</DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close">
            <XIcon className="size-5" strokeWidth={1.5} />
          </Button>
        </DialogPrimitive.Close>
      </div>

      {tabs.length > 1 && <Segmented role="tablist" label="Scale by" options={tabs} value={tab} onChange={setTab} />}

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        {tab === "factor" && (
          <div role={tabs.length > 1 ? "tabpanel" : undefined} id={`${id}-factor`} className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            <label htmlFor={`${id}-f`}>Multiply by</label>
            <input
              id={`${id}-f`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="1.5"
              value={factorTextValue}
              onChange={(e) => setFactorText(e.target.value)}
              aria-invalid={showErrors && !factorParsed.ok}
              aria-describedby={`${id}-f-hint`}
              className={inputBox}
            />
            <span id={`${id}-f-hint`} className={cn(showErrors && !factorParsed.ok && "text-destructive")}>
              {showErrors && !factorParsed.ok
                ? factorParsed.error
                : `Between ${UI_MIN_FACTOR} and ${UI_MAX_FACTOR}. Amounts round to kitchen measures.`}
            </span>
          </div>
        )}

        {tab === "yield" && (
          <div role="tabpanel" id={`${id}-yield`} className="flex flex-col gap-1.5 text-[13px] text-muted-foreground">
            <label htmlFor={`${id}-y`}>How many {draft.yieldUnit || "servings"}?</label>
            <div className={cn(inputBox, "flex items-center gap-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", showErrors && yieldError && "border-destructive")}>
              <input
                id={`${id}-y`}
                inputMode="decimal"
                autoComplete="off"
                value={yieldTextValue}
                onChange={(e) => setYieldText(e.target.value)}
                aria-invalid={showErrors && !!yieldError}
                aria-describedby={`${id}-y-hint`}
                className="w-16 min-w-0 bg-transparent outline-none"
              />
              {draft.yieldUnit && <span className="font-sans text-[15px] font-normal">{draft.yieldUnit}</span>}
              {yieldResolved?.ok && (
                <span className="ml-auto text-sm text-primary" aria-label={`Scale factor ${factorText(yieldResolved.factor)}`}>
                  <Fractions text={factorText(yieldResolved.factor)} />
                </span>
              )}
            </div>
            <span id={`${id}-y-hint`} className={cn(showErrors && yieldError && "text-destructive")}>
              {showErrors && yieldError ? yieldError : `The recipe makes ${draft.yieldQty}${draft.yieldUnit ? ` ${draft.yieldUnit}` : ""}.`}
            </span>
          </div>
        )}

        {tab === "pan" && source && (
          <div role="tabpanel" id={`${id}-pan`} className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="Pan" className="grid grid-cols-2 gap-2.5">
              {options.map((o) => (
                <PanChoice key={o.id} option={o} checked={o.id === panId} onSelect={() => setPanId(o.id)} />
              ))}
            </div>
            {showDepth ? (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={useDepth} onChange={(e) => setUseDepth(e.target.checked)} className="size-5 accent-primary" />
                Use pan depths, not only their size
              </label>
            ) : (
              <span className="text-[13px] text-muted-foreground">Compares pan sizes and assumes the same depth.</span>
            )}
          </div>
        )}

        {/* stays in reach when the pan grid scrolls */}
        <div className="sticky -bottom-7 -mx-6 bg-card px-6 pt-2 pb-7">
          <Button type="submit" size="lg" className="w-full">
            Apply
          </Button>
        </div>
      </form>
    </>
  );
}

function PanChoice({ option: o, checked, onSelect }: { option: PanOptionView; checked: boolean; onSelect: () => void }) {
  const meta = o.disabledReason ?? [o.size, o.isOriginal ? "original" : o.factor !== null && factorText(o.factor)].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={o.disabledReason !== null}
      aria-label={`${o.label}, ${meta}`}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-xl px-1.5 pt-2 pb-2.5 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
        checked ? "border-[1.5px] border-primary bg-background" : "border border-input",
      )}
    >
      <PanDiagram diagram={o.diagram} />
      <span className="text-sm">{o.label}</span>
      <span className={cn("font-mono text-xs", o.disabledReason ? "font-sans text-destructive" : "text-muted-foreground")}><Fractions text={meta} /></span>
    </button>
  );
}
