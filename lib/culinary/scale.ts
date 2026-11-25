// ScaleState → factor + warnings (docs/design.md §5).
import { panFactor, type BakeHint, type Warning } from "./pans";
import { MAX_FACTOR, MIN_FACTOR, type Pan, type RenderInput, type ScaleState, type ScalingRule } from "./schemas";

export type ScaleError = "NO_YIELD" | "NO_PAN" | "UNKNOWN_PAN" | "UNSUPPORTED_PAN" | "FACTOR_OUT_OF_RANGE";

export type ScaleResult =
  | { ok: true; factor: number; warnings: Warning[]; bakeHint?: BakeHint }
  | { ok: false; error: ScaleError };

/** Rule 12: leavening warns only outside [0.5, 2]. */
export const LEAVENING_MAX = 2;
export const LEAVENING_MIN = 0.5;

export function isLeaveningExtreme(factor: number): boolean {
  return factor > LEAVENING_MAX || factor < LEAVENING_MIN;
}

export function resolveFactor(recipe: RenderInput, scale: ScaleState, pans: readonly Pan[] = []): ScaleResult {
  let factor: number;
  let warnings: Warning[] = [];
  let bakeHint: BakeHint | undefined;

  switch (scale.mode) {
    case "none":
      factor = 1;
      break;
    case "factor":
      factor = scale.factor;
      break;
    case "yield":
      if (recipe.yieldQty === null) return { ok: false, error: "NO_YIELD" };
      factor = scale.targetQty / recipe.yieldQty;
      break;
    case "pan": {
      if (recipe.pan === null) return { ok: false, error: "NO_PAN" };
      const target = scale.targetPanId === recipe.pan.id ? recipe.pan : pans.find((p) => p.id === scale.targetPanId);
      if (!target) return { ok: false, error: "UNKNOWN_PAN" };
      const r = panFactor(recipe.pan, target, scale.useDepth);
      if (!r.ok) return r;
      ({ factor, warnings, bakeHint } = r);
      break;
    }
  }

  // rule 13 applies to every mode (e.g. yield 1 → 1000 is a 1000× factor)
  if (!Number.isFinite(factor) || factor < MIN_FACTOR || factor > MAX_FACTOR) {
    return { ok: false, error: "FACTOR_OUT_OF_RANGE" };
  }
  if (isLeaveningExtreme(factor) && recipe.ingredients.some((i) => i.rule === "leavening")) {
    warnings = [...warnings, "LEAVENING_EXTREME"];
  }
  return { ok: true, factor, warnings, ...(bakeHint && { bakeHint }) };
}

/** Whether an ingredient's quantity is multiplied by the factor. */
export function scalesWithFactor(rule: ScalingRule): boolean {
  return rule !== "to_taste" && rule !== "fixed";
}
