// Kitchen rounding and unit picking. Rules: docs/design.md §5 "Display rules".
import { fromBase, toBase, UNITS, type UnitCode } from "./units";

/** Allowed US fractional parts (rule 1). No ⅜, ⅝, ⅞. */
export const US_FRACTIONS = [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1] as const;

const EPS = 1e-9;

/** Snap to the nearest whole + allowed fraction. Ties go to the smaller value. */
export function snapUS(v: number): number {
  const whole = Math.floor(v);
  const frac = v - whole;
  let best: number = US_FRACTIONS[0];
  for (const f of US_FRACTIONS) {
    if (Math.abs(frac - f) < Math.abs(frac - best) - EPS) best = f;
  }
  return whole + best;
}

/** Largest whole + allowed fraction that is ≤ v. */
export function floorUS(v: number): number {
  const whole = Math.floor(v + EPS);
  const frac = v - whole;
  let best = 0;
  for (const f of US_FRACTIONS) if (f <= frac + EPS) best = f;
  return whole + best;
}

/** Metric rounding (rule 4): 0.5 below 10, 1 below 100, 5 below 1000, then 10. Step chosen from the unrounded value. */
export function roundMetric(v: number): number {
  const step = v < 10 ? 0.5 : v < 100 ? 1 : v < 1000 ? 5 : 10;
  return Math.round(v / step) * step;
}

/** One displayed piece of an amount. value 0 never appears: tiny amounts use kind 'pinch' / 'lt_half'. */
export type Part =
  | { kind: "qty"; value: number; unit: UnitCode | null }
  | { kind: "pinch" }
  | { kind: "lt_half"; unit: "g" | "ml" };

interface Rung { unit: UnitCode; /** move up to the next rung when the snapped value reaches this */ upTo: number }

/** Rule 2: tsp below 1 tbsp, tbsp below ¼ cup, then cup. */
export const US_VOLUME_LADDER: readonly Rung[] = [
  { unit: "tsp", upTo: 3 },
  { unit: "tbsp", upTo: 4 },
  { unit: "cup", upTo: Infinity },
];
/** Rule 3: oz below 1 lb, then lb. */
export const US_MASS_LADDER: readonly Rung[] = [
  { unit: "oz", upTo: 16 },
  { unit: "lb", upTo: Infinity },
];

/** Rule 5: the second part of a two-part amount uses whole or ½ units only. */
export function snapHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

/** Index of the rung whose snapped value stays below its upTo. Snap first, then pick (2.95 tsp → 3 tsp → 1 tbsp). */
function pickRung(base: number, ladder: readonly Rung[], snap: (v: number) => number = snapUS): number {
  for (let i = 0; i < ladder.length; i++) {
    if (snap(fromBase(base, ladder[i].unit)) < ladder[i].upTo - EPS) return i;
  }
  /* c8 ignore next */
  return ladder.length - 1; // unreachable: the last rung is unbounded
}

/** Rule 5: the max relative error of a single snapped part before splitting into two parts. */
export const TWO_PART_THRESHOLD = 0.05;

/**
 * US amount (base ml or g) → 1 or 2 parts on the given ladder.
 * @param allowTwoPart false for ranges (rule 11)
 */
export function usParts(base: number, ladder: readonly Rung[], allowTwoPart = true): Part[] {
  const i = pickRung(base, ladder);
  const unit = ladder[i].unit;
  const v = fromBase(base, unit);
  const s = snapUS(v);
  if (s === 0) return [{ kind: "pinch" }];
  const single: Part[] = [{ kind: "qty", value: s, unit }];
  if (!allowTwoPart || i === 0 || Math.abs(v - s) / v <= TWO_PART_THRESHOLD) return single;

  const first = floorUS(v);
  const remBase = base - toBase(first, unit);
  const smaller = ladder.slice(0, i);
  const j = pickRung(remBase, smaller, snapHalf);
  const remSnap = snapHalf(fromBase(remBase, smaller[j].unit));
  // remainder too small to show, or it climbed to the size of the first unit: keep one part
  if (remSnap === 0 || remSnap >= smaller[j].upTo - EPS) return single;
  return [
    { kind: "qty", value: first, unit },
    { kind: "qty", value: remSnap, unit: smaller[j].unit },
  ];
}

/** Metric amount (base ml or g) → one part (rule 4). */
export function metricPart(base: number, dimension: "volume" | "mass"): Part {
  const small = dimension === "volume" ? "ml" : "g";
  const r = roundMetric(base);
  if (r === 0) return { kind: "lt_half", unit: small };
  if (r >= 1000) return { kind: "qty", value: r / 1000, unit: dimension === "volume" ? "l" : "kg" };
  return { kind: "qty", value: r, unit: small };
}

/** Rule 7: count_round items other than eggs → nearest ½, never 0. */
export function roundHalf(v: number): number {
  return Math.max(0.5, Math.round(v * 2) / 2);
}

/** Counts (no unit) that scale linearly: US fractions, never 0 (smallest shown is ⅛). */
export function snapCount(v: number): number {
  return Math.max(1 / 8, snapUS(v));
}

/**
 * Rule 6: eggs. Returns whole eggs and the beaten-egg remainder as a fraction of an egg.
 * remainder ¼–¾ → beaten egg; otherwise round to nearest whole; below ¼ egg total → beaten only;
 * 3 or more whole eggs → always the nearest whole egg.
 */
export function splitEggs(q: number): { whole: number; beaten: number } {
  const whole = Math.floor(q + EPS);
  const r = q - whole;
  // 3 or more whole eggs: nearest whole egg, no beaten remainder (.5 rounds up)
  if (whole >= EGG_WHOLE_ONLY_FROM) return { whole: Math.floor(q + 0.5 + EPS), beaten: 0 };
  if (whole === 0 && r < 0.75 + EPS) return { whole: 0, beaten: r };
  if (r < 0.25 - EPS) return { whole, beaten: 0 };
  if (r > 0.75 + EPS) return { whole: whole + 1, beaten: 0 };
  return { whole, beaten: r };
}

/** From this many whole eggs up, eggs round to whole (rule 6). */
export const EGG_WHOLE_ONLY_FROM = 3;

/** ≈1 tbsp of beaten egg per ¼ egg. */
export const BEATEN_EGG_ML_PER_EGG = 4 * UNITS.tbsp.toBase;
