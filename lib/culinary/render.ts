// render(recipe, scale, units): the only entry point the UI needs. Pure: never mutates its input.
// Pipeline and rules: docs/design.md §5.
import { convert } from "./convert";
import { formatParts, formatPart, formatRange, formatUSNumber } from "./format";
import type { BakeHint, Warning } from "./pans";
import {
  BEATEN_EGG_ML_PER_EGG, metricPart, roundHalf, roundMetric, snapCount, snapUS, splitEggs, usParts,
  US_MASS_LADDER, US_VOLUME_LADDER, type Part,
} from "./rounding";
import { isLeaveningExtreme, resolveFactor, scalesWithFactor, type ScaleError } from "./scale";
import type { IngredientInput, Pan, RenderInput, ScaleState } from "./schemas";
import { fromBase, UNITS, type UnitSystem } from "./units";

export interface RenderedIngredient {
  id: string;
  name: string;
  preparation: string | null;
  /** "⅓ cup + 2 tsp", "2–3", null when there is no quantity ("salt, to taste") */
  amount: string | null;
  /** true for eggs with a beaten remainder: amount already reads "2 eggs + 2 tbsp beaten egg" */
  amountIncludesName: boolean;
  /** the quantity as entered, set only when `amount` differs from it (the muted "orig." label) */
  original: string | null;
  leaveningWarning: boolean;
}

export type RenderedRecipe =
  | {
      ok: true;
      factor: number;
      units: UnitSystem;
      warnings: Warning[];
      bakeHint?: BakeHint;
      ingredients: RenderedIngredient[];
    }
  | { ok: false; error: ScaleError };

/** Rule 9: the majority system of the entered units. Ties and unit-less recipes count as US. */
export function sourceSystem(recipe: RenderInput): UnitSystem {
  let us = 0;
  let metric = 0;
  for (const i of recipe.ingredients) {
    if (i.unitCode === null) continue;
    if (UNITS[i.unitCode].system === "metric") metric++;
    else us++;
  }
  return metric > us ? "metric" : "us";
}

export function render(
  recipe: RenderInput,
  scale: ScaleState,
  units: UnitSystem,
  options: { pans?: readonly Pan[] } = {},
): RenderedRecipe {
  const r = resolveFactor(recipe, scale, options.pans);
  if (!r.ok) return r;
  const original = r.factor === 1 && units === sourceSystem(recipe);

  const ingredients = recipe.ingredients.map((ing): RenderedIngredient => {
    const entered = asEntered(ing);
    const out = original ? { text: entered, includesName: false } : amountFor(ing, r.factor, units);
    return {
      id: ing.id,
      name: ing.name,
      preparation: ing.preparation,
      amount: out.text,
      amountIncludesName: out.includesName,
      original: out.text !== entered ? entered : null,
      leaveningWarning: ing.rule === "leavening" && isLeaveningExtreme(r.factor),
    };
  });

  return {
    ok: true,
    factor: r.factor,
    units,
    warnings: r.warnings,
    ...(r.bakeHint && { bakeHint: r.bakeHint }),
    ingredients,
  };
}

/** The quantity exactly as entered, formatted. */
export function asEntered(ing: IngredientInput): string | null {
  if (ing.quantity === null) return null;
  if (ing.quantityMax !== null) return formatRange(ing.quantity, ing.quantityMax, ing.unitCode);
  return formatPart({ kind: "qty", value: ing.quantity, unit: ing.unitCode });
}

interface Amount { text: string | null; includesName: boolean }
const plain = (text: string | null): Amount => ({ text, includesName: false });

function amountFor(ing: IngredientInput, factor: number, units: UnitSystem): Amount {
  if (ing.quantity === null) return plain(null);
  const f = scalesWithFactor(ing.rule) ? factor : 1;
  const sameSystem = ing.unitCode === null || UNITS[ing.unitCode].system === units;
  if (f === 1 && sameSystem) return plain(asEntered(ing));

  const q = ing.quantity * f;
  const qMax = ing.quantityMax === null ? null : ing.quantityMax * f;

  if (ing.unitCode === null) return countAmount(ing, q, qMax, units);

  const conv = convert(q, ing.unitCode, ing, units);
  if (qMax !== null) {
    const convMax = convert(qMax, ing.unitCode, ing, units);
    return plain(rangeText(conv.base, convMax.base, conv.dimension, units));
  }
  const parts: Part[] =
    units === "us"
      ? usParts(conv.base, conv.dimension === "volume" ? US_VOLUME_LADDER : US_MASS_LADDER)
      : [metricPart(conv.base, conv.dimension)];
  return plain(formatParts(parts));
}

function countAmount(ing: IngredientInput, q: number, qMax: number | null, units: UnitSystem): Amount {
  const round = (v: number): number =>
    ing.rule !== "count_round" ? snapCount(v) : ing.isEgg ? Math.max(1, Math.round(v)) : roundHalf(v);
  // rule 11: ranges round each end (eggs to whole eggs, no beaten remainder)
  if (qMax !== null) return plain(formatRange(round(q), round(qMax), null));
  if (ing.rule === "count_round" && ing.isEgg) return { text: eggText(q, units, ing.eachG), includesName: true };
  return plain(formatUSNumber(round(q)));
}

/** Rule 6: "2 eggs + 2 tbsp beaten egg". */
function eggText(q: number, units: UnitSystem, eachG: number | null): string {
  const { whole, beaten } = splitEggs(q);
  const pieces: string[] = [];
  if (whole > 0) pieces.push(`${whole} ${whole === 1 ? "egg" : "eggs"}`);
  if (beaten > 0) {
    const parts: Part[] =
      units === "us"
        ? usParts(beaten * BEATEN_EGG_ML_PER_EGG, US_VOLUME_LADDER)
        : [eachG !== null ? metricPart(beaten * eachG, "mass") : metricPart(beaten * BEATEN_EGG_ML_PER_EGG, "volume")];
    pieces.push(`${formatParts(parts)} beaten egg`);
  }
  return pieces.join(" + ");
}

/** Rule 11: both ends in one unit, picked from the larger end; no two-part. */
function rangeText(minBase: number, maxBase: number, dim: "volume" | "mass", units: UnitSystem): string {
  if (units === "us") {
    const [top] = usParts(maxBase, dim === "volume" ? US_VOLUME_LADDER : US_MASS_LADDER, false);
    if (top.kind !== "qty" || top.unit === null) return formatPart(top);
    const min = Math.max(1 / 8, snapUS(fromBase(minBase, top.unit)));
    return formatRange(min, top.value, top.unit);
  }
  const top = metricPart(maxBase, dim);
  if (top.kind !== "qty" || top.unit === null) return formatPart(top);
  const big = top.unit === "kg" || top.unit === "l";
  const min = big ? Math.round(minBase / 10) / 100 : Math.max(0.5, roundMetric(minBase));
  return formatRange(min, top.value, top.unit);
}
