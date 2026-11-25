// Unit-system conversion (docs/design.md §5 "Render pipeline" step 2).
// Crossing dimensions (volume ↔ mass) needs a known density and only happens when crossing systems.
import { toBase, UNITS, type UnitCode, type UnitSystem } from "./units";

export interface DensityInfo {
  densityGPerMl: number | null;
  preferMassInMetric: boolean;
}

export interface Converted {
  dimension: "volume" | "mass";
  /** amount in ml (volume) or g (mass) */
  base: number;
}

/**
 * Convert an entered quantity to the dimension it should be displayed in for `target`.
 * - US volume → metric: grams if density is known and preferMassInMetric, else ml.
 * - Metric mass → US: volume (cups ladder) if density is known, else oz/lb.
 * - Same system, or no density: stays in its own dimension.
 */
export function convert(qty: number, unit: UnitCode, ing: DensityInfo, target: UnitSystem): Converted {
  const def = UNITS[unit];
  const base = toBase(qty, unit);
  const density = ing.densityGPerMl;
  if (def.system === target || density === null) return { dimension: def.dimension, base };

  if (def.dimension === "volume" && target === "metric" && ing.preferMassInMetric) {
    return { dimension: "mass", base: base * density };
  }
  if (def.dimension === "mass" && target === "us") {
    return { dimension: "volume", base: base / density };
  }
  return { dimension: def.dimension, base };
}
