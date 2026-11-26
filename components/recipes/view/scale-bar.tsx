import { cn } from "cn";
import { Fractions } from "@/components/fractions";
import { CHIP_FACTORS, CHIP_LABELS, type ChipFactor } from "@/lib/recipes/scale-view";

const pill =
  "h-11 min-w-0 flex-1 rounded-full border font-mono text-[15px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const pillState = (on: boolean) =>
  on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-transparent text-foreground hover:bg-card";

export function ScaleBar({
  active,
  factor,
  moreLabel,
  onChip,
  onMore,
  children,
}: {
  active: ChipFactor | "more";
  /** the ×factor readout */
  factor: string;
  moreLabel: string;
  onChip: (f: ChipFactor) => void;
  onMore: () => void;
  /** the unit toggle row */
  children: React.ReactNode;
}) {
  return (
    <div className="mx-6 mt-6 flex flex-col gap-3.5 border-y border-border py-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs tracking-[0.12em] text-muted-foreground uppercase">Scale</span>
        <output aria-live="polite" aria-label="Scale factor" className="font-mono text-[22px] font-medium text-primary">
          <Fractions text={factor} />
        </output>
      </div>
      <div role="group" aria-label="Scale" className="flex gap-2">
        {CHIP_FACTORS.map((f) => (
          <button key={f} type="button" aria-pressed={active === f} onClick={() => onChip(f)} className={cn(pill, pillState(active === f))}>
            <Fractions text={CHIP_LABELS[f]} />
          </button>
        ))}
        <button
          type="button"
          aria-pressed={active === "more"}
          aria-haspopup="dialog"
          onClick={onMore}
          className={cn(pill, pillState(active === "more"), "flex-[1.4] truncate px-2 font-sans")}
        >
          {moreLabel}
        </button>
      </div>
      {children}
    </div>
  );
}
