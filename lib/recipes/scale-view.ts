// What the recipe view shows around render(): chip state, the ×factor readout,
// warning sentences, pan options for the scale sheet, the scaled yield and oven
// text. Pure: no I/O, no React. Wording lives here, not in lib/culinary (rule 14).
import {
  panArea, panFactor, parseQuantity, shapeClass, UNITS,
  type BakeHint, type Pan, type RenderedRecipe, type RenderInput, type ScaleState, type UnitSystem, type Warning,
} from "@/lib/culinary";
import { formatUSNumber } from "@/lib/culinary/format";
import { cToFahrenheit } from "./schema";

// ── Scale bar ────────────────────────────────────────────────────────────────

export const CHIP_FACTORS = [0.5, 1, 2, 3] as const;
export type ChipFactor = (typeof CHIP_FACTORS)[number];

export const CHIP_LABELS: Record<ChipFactor, string> = { 0.5: "½×", 1: "1×", 2: "2×", 3: "3×" };

/** Which chip is pressed: a chip factor, or "more" for anything the sheet set. */
export function activeChip(scale: ScaleState): ChipFactor | "more" {
  if (scale.mode === "none") return 1;
  if (scale.mode === "factor") return CHIP_FACTORS.find((f) => f === scale.factor) ?? "more";
  return "more";
}

/** A chip tap. 1× is the original, so it clears the mode rather than writing f=1. */
export function chipScale(f: ChipFactor): ScaleState {
  return f === 1 ? { mode: "none" } : { mode: "factor", factor: f };
}

/** "9×13 in rectangle" → "9×13", "Half sheet (18×13 in)" → "Half sheet", "8 in round" stays. */
export function shortPanLabel(label: string): string {
  const dims = /^(\d+(?:\.\d+)?\s*×\s*\d+(?:\.\d+)?)\s*in\b/.exec(label);
  if (dims) return dims[1].replace(/\s+/g, "");
  return label.replace(/\s*\(.*\)\s*$/, "").trim();
}

/** The "More" chip names the pan while a pan is active (doc §8). */
export function moreLabel(scale: ScaleState, pans: readonly (Pan & { label: string })[]): string {
  if (scale.mode !== "pan") return "More";
  const p = pans.find((x) => x.id === scale.targetPanId);
  return p ? shortPanLabel(p.label) : "More";
}

/** The readout: 1.84 → "×1.84", 0.5 → "×0.5", 2 → "×2". */
export function factorText(f: number): string {
  return `×${Math.round(f * 100) / 100}`;
}

/** Whether the view differs from the recipe as entered, which is when Reset shows. */
export function isScaledView(scale: ScaleState, units: UnitSystem, source: UnitSystem): boolean {
  return scale.mode !== "none" || units !== source;
}

// ── Warnings ─────────────────────────────────────────────────────────────────

const SHAPE_NAMES: Record<ReturnType<typeof shapeClass>, string> = {
  round: "round", rect: "rectangle", ring: "ring pan", muffin: "muffin tin", other: "a different pan",
};

const ERRORS: Record<Extract<RenderedRecipe, { ok: false }>["error"], string> = {
  NO_YIELD: "This recipe has no yield to scale by, so it shows as written.",
  NO_PAN: "This recipe has no pan set, so it shows as written.",
  UNKNOWN_PAN: "That pan isn’t in your list any more, so the recipe shows as written.",
  UNSUPPORTED_PAN: "These two pans can’t be compared, so the recipe shows as written.",
  FACTOR_OUT_OF_RANGE: "That’s outside what the recipe can scale to (0.01× to 100×), so it shows as written.",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function hintSentence(hint: BakeHint): string {
  return hint.direction === "shallower"
    ? "The batter will be shallower, so it bakes faster. Start checking early."
    : "The batter will be deeper, so it needs longer and maybe a lower oven temperature.";
}

/**
 * The notes between the scale bar and the ingredients, in order: render error,
 * pan shape, depth, leavening. `source` and `target` are the pans when a pan is active.
 */
export function warningNotes(
  rendered: RenderedRecipe,
  input: RenderInput,
  pans: { source: Pan | null; target: Pan | null } = { source: null, target: null },
): string[] {
  if (!rendered.ok) return [ERRORS[rendered.error]];
  const w = new Set<Warning>(rendered.warnings);
  const notes: string[] = [];

  if (w.has("SHAPE_CHANGE") && pans.source && pans.target) {
    const from = SHAPE_NAMES[shapeClass(pans.source)];
    const to = SHAPE_NAMES[shapeClass(pans.target)];
    notes.push(`${cap(from)} to ${to} changes the bake time.${rendered.bakeHint ? "" : " Start checking early."}`);
  }
  if (rendered.bakeHint) notes.push(hintSentence(rendered.bakeHint));
  else if (w.has("BAKE_TIME_CHANGES") && !w.has("SHAPE_CHANGE")) notes.push("The bake time may change. Start checking early.");

  if (w.has("DEPTH_UNKNOWN")) notes.push("One pan has no depth set, so a 5 cm depth was assumed.");

  if (w.has("LEAVENING_EXTREME")) {
    const names = [...new Set(input.ingredients.filter((i) => i.rule === "leavening").map((i) => i.name))];
    const verb = names.length === 1 ? "doesn’t" : "don’t";
    notes.push(
      rendered.factor > 1
        ? `${cap(joinNames(names))} ${verb} always scale past 2×. Consider two batches.`
        : `${cap(joinNames(names))} ${verb} always scale below ½×. Check the rise.`,
    );
  }
  return notes;
}

// ── Scale sheet: pans ────────────────────────────────────────────────────────

export type PanDiagram =
  | { kind: "round"; r: number }
  | { kind: "rect"; w: number; h: number }
  | { kind: "ring" }
  | { kind: "muffin" };

export interface PanOptionView {
  id: string;
  label: string;
  /** "117 in²", "10 cups", "12 cups" */
  size: string | null;
  /** null when disabled */
  factor: number | null;
  disabledReason: string | null;
  isOriginal: boolean;
  diagram: PanDiagram;
}

const CM2_PER_IN2 = 6.4516;
/** Diagram box for the largest pan, in SVG units (viewBox 110×70, with room for the scale rule). */
const BOX_W = 94;
const BOX_H = 50;

function sizeText(p: Pan): string | null {
  const area = panArea(p);
  if (area !== null) return `${Math.round((area / CM2_PER_IN2) * 10) / 10} in²`;
  if (p.cupCount !== null) return `${p.cupCount} cups`;
  if (p.volumeMl !== null) return `${formatUSNumber(Math.round((p.volumeMl / UNITS.cup.toBase) * 2) / 2)} cups`;
  return null;
}

function disabledReason(source: Pan, target: Pan): string {
  const s = shapeClass(source);
  const t = shapeClass(target);
  if (s === "muffin" && t !== "muffin") return "Can’t convert muffins to a cake pan";
  if (t === "muffin" && s !== "muffin") return "Can’t convert a cake pan to muffins";
  return "Size not set for this pan";
}

/** The pan tab's options: the recipe's pan first, then the rest in list order. */
export function panOptions(
  source: Pan,
  pans: readonly (Pan & { label: string })[],
  useDepth: boolean,
): PanOptionView[] {
  const ordered = [...pans.filter((p) => p.id === source.id), ...pans.filter((p) => p.id !== source.id)];
  // one scale for every diagram, so the drawings compare honestly
  const dims = ordered.map((p) => {
    const c = shapeClass(p);
    if (c === "round" && p.diameterCm !== null) return [p.diameterCm, p.diameterCm];
    if (c === "rect" && p.widthCm !== null && p.lengthCm !== null) return [Math.max(p.widthCm, p.lengthCm), Math.min(p.widthCm, p.lengthCm)];
    return null;
  });
  const maxW = Math.max(1, ...dims.map((d) => d?.[0] ?? 0));
  const maxH = Math.max(1, ...dims.map((d) => d?.[1] ?? 0));
  const k = Math.min(BOX_W / maxW, BOX_H / maxH);

  return ordered.map((p, i): PanOptionView => {
    const isOriginal = p.id === source.id;
    const r = isOriginal ? { ok: true as const, factor: 1 } : panFactor(source, p, useDepth);
    const d = dims[i];
    const c = shapeClass(p);
    const diagram: PanDiagram =
      d && c === "round" ? { kind: "round", r: (d[0] * k) / 2 }
      : d ? { kind: "rect", w: d[0] * k, h: d[1] * k }
      : c === "muffin" ? { kind: "muffin" }
      : { kind: "ring" };
    return {
      id: p.id,
      label: p.label,
      size: sizeText(p),
      factor: r.ok ? r.factor : null,
      disabledReason: r.ok ? null : disabledReason(source, p),
      isOriginal,
      diagram,
    };
  });
}

/** "Use pan depths" only means something when both pans have a depth. */
export function depthApplies(source: Pan, target: Pan | null): boolean {
  return target !== null && target.id !== source.id && source.depthCm !== null && target.depthCm !== null;
}

// ── Meta line ────────────────────────────────────────────────────────────────

/** "12 squares", "18 squares", "about 22 squares"; null when the recipe has no yield. */
export function scaledYieldText(
  qty: number | null,
  unit: string | null,
  factor: number,
  mode: ScaleState["mode"],
): string | null {
  if (qty === null) return null;
  const v = qty * factor;
  // whole numbers from 1 up; below that the nearest quarter ("½ loaf")
  const shown = v >= 1 ? Math.round(v) : Math.max(0.25, Math.round(v * 4) / 4);
  // pan scaling is approximate by nature (doc §8 canvas: "about 22 squares")
  const exact = Math.abs(v - shown) < 1e-6 && (mode !== "pan" || factor === 1);
  const n = formatUSNumber(shown);
  return [exact ? n : `about ${n}`, unit].filter(Boolean).join(" ");
}

/** The oven temperature in the selected system: 350 °F or 175 °C. */
export function ovenText(c: number, units: UnitSystem): string {
  return units === "us" ? `${cToFahrenheit(c)} °F` : `${Math.round(c / 5) * 5} °C`;
}

// ── Scale sheet: factor input ────────────────────────────────────────────────

/** The sheet's range (doc §5 rule 13 note). lib/culinary allows 0.01–100. */
export const UI_MIN_FACTOR = 0.1;
export const UI_MAX_FACTOR = 20;

export type FactorInput = { ok: true; factor: number } | { ok: false; error: string };

/** "1.5", "1½", "×2", "2x" → a factor between 0.1 and 20. */
export function parseFactorInput(text: string): FactorInput {
  const s = text.trim().replace(/^[×x]\s*|\s*[×x]$/gi, "");
  if (s === "") return { ok: false, error: "Enter a number, like 1.5." };
  const q = parseQuantity(s);
  if (!q.ok || q.quantity === null) return { ok: false, error: "Enter a number, like 1.5 or 1½." };
  if (q.quantityMax !== null) return { ok: false, error: "Enter one number, not a range." };
  if (q.quantity < UI_MIN_FACTOR || q.quantity > UI_MAX_FACTOR) {
    return { ok: false, error: `Use a number between ${UI_MIN_FACTOR} and ${UI_MAX_FACTOR}.` };
  }
  return { ok: true, factor: q.quantity };
}

/** The yield tab's target count: a positive number. */
export function parseYieldInput(text: string): { ok: true; qty: number } | { ok: false; error: string } {
  const q = parseQuantity(text);
  if (!q.ok || q.quantity === null) return { ok: false, error: "Enter how many you want to make." };
  if (q.quantityMax !== null) return { ok: false, error: "Enter one number, not a range." };
  return { ok: true, qty: q.quantity };
}
