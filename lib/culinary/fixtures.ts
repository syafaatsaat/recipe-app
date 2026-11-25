// Test fixtures (not exported from index.ts).
import type { IngredientInput, Pan, RenderInput } from "./schemas";

let n = 0;
export function ing(p: Partial<IngredientInput> & Pick<IngredientInput, "name">): IngredientInput {
  return {
    id: `i${++n}`,
    quantity: null, quantityMax: null, unitCode: null, preparation: null,
    rule: "linear", densityGPerMl: null, eachG: null, preferMassInMetric: true, isEgg: false,
    ...p,
  };
}

export function recipe(ingredients: IngredientInput[], p: Partial<RenderInput> = {}): RenderInput {
  return { yieldQty: null, pan: null, ingredients, ...p };
}

export const IN = 2.54;
export const PAN_9_ROUND: Pan = {
  id: "11111111-0000-0000-0000-000000000009", shape: "round", diameterCm: 9 * IN,
  widthCm: null, lengthCm: null, depthCm: 2 * IN, volumeMl: null, cupCount: null,
};
export const PAN_9X13: Pan = {
  id: "22222222-0000-0000-0000-000000000913", shape: "rectangle", diameterCm: null,
  widthCm: 9 * IN, lengthCm: 13 * IN, depthCm: 2 * IN, volumeMl: null, cupCount: null,
};
export const PAN_MUFFIN: Pan = {
  id: "33333333-0000-0000-0000-000000000012", shape: "muffin", diameterCm: null,
  widthCm: null, lengthCm: null, depthCm: null, volumeMl: null, cupCount: 12,
};

// catalog-like ingredients (seed values)
export const flour = (quantity: number, unitCode: IngredientInput["unitCode"] = "cup") =>
  ing({ name: "all-purpose flour", quantity, unitCode, densityGPerMl: 0.5072 });
export const milk = (quantity: number, unitCode: IngredientInput["unitCode"] = "cup") =>
  ing({ name: "milk", quantity, unitCode, densityGPerMl: 1.031, preferMassInMetric: false });
export const eggs = (quantity: number) =>
  ing({ name: "eggs", quantity, rule: "count_round", eachG: 50, isEgg: true });
export const bakingPowder = (quantity: number) =>
  ing({ name: "baking powder", quantity, unitCode: "tsp", rule: "leavening", densityGPerMl: 0.8115 });
