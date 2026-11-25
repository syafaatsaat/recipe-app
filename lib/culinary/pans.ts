// Pan-to-pan scaling factor (docs/design.md §5 "Pan factor").
import type { Pan } from "./schemas";

export type Warning = "BAKE_TIME_CHANGES" | "LEAVENING_EXTREME" | "SHAPE_CHANGE" | "DEPTH_UNKNOWN";
export interface BakeHint { direction: "shallower" | "deeper" }

export type PanFactorResult =
  | { ok: true; factor: number; warnings: Warning[]; bakeHint?: BakeHint }
  | { ok: false; error: "UNSUPPORTED_PAN" };

/** Depth assumed for an area pan when comparing it with a volume pan and its depth is unknown. */
export const ASSUMED_DEPTH_CM = 5;
/** Depths differing by more than this fraction change bake time. */
export const DEPTH_TOLERANCE = 0.2;
const EPS = 1e-9;

type ShapeClass = "round" | "rect" | "ring" | "muffin" | "other";

export function shapeClass(p: Pan): ShapeClass {
  switch (p.shape) {
    case "round": case "springform": case "skillet": return "round";
    case "square": case "rectangle": case "loaf": case "sheet": return "rect";
    case "bundt": case "tube": return "ring";
    case "muffin": return "muffin";
    case "other": return "other";
  }
}

/** Base area in cm², or null if the pan isn't an area pan or lacks dimensions. */
export function panArea(p: Pan): number | null {
  const c = shapeClass(p);
  if (c === "round" && p.diameterCm !== null) return Math.PI * (p.diameterCm / 2) ** 2;
  if (c === "rect" && p.widthCm !== null && p.lengthCm !== null) return p.widthCm * p.lengthCm;
  return null;
}

/** How a pan is measured: by area (+ optional depth), by volume, or by muffin cups. */
type Measure =
  | { kind: "area"; area: number; depth: number | null }
  | { kind: "volume"; volume: number }
  | { kind: "cups"; cups: number };

function measure(p: Pan): Measure | null {
  const c = shapeClass(p);
  if (c === "muffin") return p.cupCount !== null ? { kind: "cups", cups: p.cupCount } : null;
  const area = panArea(p);
  if (area !== null) return { kind: "area", area, depth: p.depthCm };
  // ring pans and 'other' are measured by volume (rule 14: 'other' needs volume_ml)
  return p.volumeMl !== null ? { kind: "volume", volume: p.volumeMl } : null;
}

/** factor = how much more batter the target pan holds than the source pan. */
export function panFactor(source: Pan, target: Pan, useDepth: boolean): PanFactorResult {
  const s = measure(source);
  const t = measure(target);
  if (!s || !t) return { ok: false, error: "UNSUPPORTED_PAN" };
  // rule 14: no reliable volume for a muffin cup
  if ((s.kind === "cups") !== (t.kind === "cups")) return { ok: false, error: "UNSUPPORTED_PAN" };

  const warnings = new Set<Warning>();
  let factor: number;

  if (s.kind === "cups" && t.kind === "cups") {
    factor = t.cups / s.cups;
  } else if (s.kind === "area" && t.kind === "area") {
    if (useDepth && s.depth !== null && t.depth !== null) {
      factor = (t.area * t.depth) / (s.area * s.depth);
    } else {
      if (useDepth) warnings.add("DEPTH_UNKNOWN");
      factor = t.area / s.area;
    }
  } else {
    // at least one volume pan: area pans need a depth to become a volume
    const vol = (m: Measure): number => {
      if (m.kind === "volume") return m.volume;
      /* c8 ignore next */
      if (m.kind !== "area") throw new Error("unreachable");
      if (m.depth === null) warnings.add("DEPTH_UNKNOWN");
      return m.area * (m.depth ?? ASSUMED_DEPTH_CM);
    };
    factor = vol(t) / vol(s);
  }

  let bakeHint: BakeHint | undefined;
  if (shapeClass(source) !== shapeClass(target)) {
    warnings.add("SHAPE_CHANGE");
    warnings.add("BAKE_TIME_CHANGES");
  }
  if (source.depthCm !== null && target.depthCm !== null) {
    const ratio = target.depthCm / source.depthCm;
    if (Math.abs(ratio - 1) > DEPTH_TOLERANCE + EPS) {
      warnings.add("BAKE_TIME_CHANGES");
      bakeHint = { direction: ratio < 1 ? "shallower" : "deeper" };
    }
  }

  return { ok: true, factor, warnings: [...warnings], ...(bakeHint && { bakeHint }) };
}
