// Turning numbers and parts into display text. Rules: docs/design.md §5 "Display rules".
import type { Part } from "./rounding";
import { UNITS, type UnitCode } from "./units";

const GLYPHS: ReadonlyArray<[number, string]> = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"],
];
const EPS = 1e-6;

/** 1.5 → "1½", 0.333… → "⅓", 2 → "2". Values that aren't whole + an allowed fraction fall back to decimals. */
export function formatUSNumber(v: number): string {
  const whole = Math.floor(v + EPS);
  const frac = v - whole;
  if (frac < EPS) return String(whole);
  const glyph = GLYPHS.find(([f]) => Math.abs(frac - f) < EPS)?.[1];
  if (!glyph) return formatDecimal(v);
  return whole === 0 ? glyph : `${whole}${glyph}`;
}

/** At most 2 decimals, trailing zeros trimmed: 1.25 → "1.25", 1.20 → "1.2", 120 → "120". */
export function formatDecimal(v: number): string {
  return String(Math.round(v * 100) / 100);
}

const LABELS: Record<UnitCode, [singular: string, plural: string]> = {
  tsp: ["tsp", "tsp"], tbsp: ["tbsp", "tbsp"], fl_oz: ["fl oz", "fl oz"],
  cup: ["cup", "cups"], pint: ["pint", "pints"], quart: ["quart", "quarts"],
  ml: ["ml", "ml"], l: ["L", "L"], g: ["g", "g"], kg: ["kg", "kg"], oz: ["oz", "oz"], lb: ["lb", "lb"],
};

export function unitLabel(unit: UnitCode, value: number): string {
  const [one, many] = LABELS[unit];
  return value > 1 + EPS ? many : one;
}

/** Number in the style of its unit: US units and counts get fractions, metric gets decimals. */
export function formatNumberFor(value: number, unit: UnitCode | null): string {
  return unit && UNITS[unit].system === "metric" ? formatDecimal(value) : formatUSNumber(value);
}

export function formatPart(p: Part): string {
  if (p.kind === "pinch") return "pinch";
  if (p.kind === "lt_half") return `<0.5 ${p.unit}`;
  const n = formatNumberFor(p.value, p.unit);
  return p.unit ? `${n} ${unitLabel(p.unit, p.value)}` : n;
}

export function formatParts(parts: readonly Part[]): string {
  return parts.map(formatPart).join(" + ");
}

/** "2–3 cups", "1½–2". Both ends share the unit; the label follows the larger end. */
export function formatRange(min: number, max: number, unit: UnitCode | null): string {
  const a = formatNumberFor(min, unit);
  const b = formatNumberFor(max, unit);
  return unit ? `${a}–${b} ${unitLabel(unit, max)}` : `${a}–${b}`;
}
