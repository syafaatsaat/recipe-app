// Turns a stored recipe (draft + linked ingredients + pan) into lib/culinary's
// RenderInput. Pure: no I/O.
import type { IngredientInput, Pan, RenderInput, ScalingRule } from "@/lib/culinary";
import type { RecipeDraft } from "./schema";

export interface CatalogIngredient {
  id: string;
  name: string;
  /** the user's own ingredient (doc §3.7) rather than the global catalog */
  mine: boolean;
  densityGPerMl: number | null;
  eachG: number | null;
  defaultScalingRule: ScalingRule;
  preferMassInMetric: boolean;
  isEgg: boolean;
}

export interface RenderLine {
  /** stable within one render: "<section>-<line>" */
  id: string;
  sectionIndex: number;
  isOptional: boolean;
  note: string | null;
  input: IngredientInput;
}

export function toRenderLines(draft: RecipeDraft, catalog: Record<string, CatalogIngredient>): RenderLine[] {
  return draft.sections.flatMap((s, si) =>
    s.ingredients.map((l, li) => {
      const c = l.ingredientId ? catalog[l.ingredientId] : undefined;
      return {
        id: `${si}-${li}`,
        sectionIndex: si,
        isOptional: l.isOptional,
        note: l.note,
        input: {
          id: `${si}-${li}`,
          name: l.name,
          quantity: l.quantity,
          quantityMax: l.quantityMax,
          unitCode: l.unitCode,
          preparation: l.preparation,
          // a line with no amount is "to taste" whatever its catalog rule says
          rule: l.quantity === null ? "to_taste" : (l.scalingRule ?? c?.defaultScalingRule ?? "linear"),
          densityGPerMl: c?.densityGPerMl ?? null,
          eachG: c?.eachG ?? null,
          preferMassInMetric: c?.preferMassInMetric ?? true,
          isEgg: c?.isEgg ?? false,
        },
      };
    }),
  );
}

export function toRenderInput(draft: RecipeDraft, lines: RenderLine[], pan: Pan | null): RenderInput {
  return { yieldQty: draft.yieldQty, pan, ingredients: lines.map((l) => l.input) };
}
