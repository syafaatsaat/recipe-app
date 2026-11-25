import { describe, expect, it } from "vitest";
import { render } from "@/lib/culinary";
import { toRenderInput, toRenderLines, type CatalogIngredient } from "./render-input";
import { emptyDraft, emptyLine, type RecipeDraft } from "./schema";

const EGG = "7c2d4e6f-1a3b-4c5d-8e9f-0a1b2c3d4e5f";
const FLOUR = "3f1e6a2c-8d4b-4c1a-9e2f-5b7d0c6a1f10";
const catalog: Record<string, CatalogIngredient> = {
  [EGG]: { id: EGG, name: "egg", mine: false, densityGPerMl: null, eachG: 50, defaultScalingRule: "count_round", preferMassInMetric: true, isEgg: true },
  [FLOUR]: { id: FLOUR, name: "all-purpose flour", mine: false, densityGPerMl: 0.5072, eachG: null, defaultScalingRule: "linear", preferMassInMetric: true, isEgg: false },
};

const draft: RecipeDraft = {
  ...emptyDraft(),
  title: "Brownies",
  yieldQty: 12,
  sections: [
    { title: "Batter", ingredients: [
      { ...emptyLine(), name: "large eggs", quantity: 2, ingredientId: EGG },
      { ...emptyLine(), name: "flour", quantity: 0.5, unitCode: "cup", ingredientId: FLOUR, scalingRule: "fixed" },
    ] },
    { title: "Topping", ingredients: [
      { ...emptyLine(), name: "flaky salt", ingredientId: FLOUR },
      { ...emptyLine(), name: "espresso powder", quantity: 1, quantityMax: 2, unitCode: "tsp", isOptional: true, note: "or coffee" },
    ] },
  ],
};

describe("toRenderLines", () => {
  const lines = toRenderLines(draft, catalog);

  it("takes catalog data for linked lines and defaults for unmatched ones", () => {
    expect(lines.map((l) => l.id)).toEqual(["0-0", "0-1", "1-0", "1-1"]);
    expect(lines[0].input).toMatchObject({ rule: "count_round", isEgg: true, eachG: 50 });
    expect(lines[1].input).toMatchObject({ rule: "fixed", densityGPerMl: 0.5072 }); // line rule beats catalog
    expect(lines[2].input.rule).toBe("to_taste"); // no amount
    expect(lines[3]).toMatchObject({ sectionIndex: 1, isOptional: true, note: "or coffee" });
    expect(lines[3].input).toMatchObject({ rule: "linear", densityGPerMl: null, preferMassInMetric: true, isEgg: false });
  });

  it("feeds render() at 1× as entered", () => {
    const r = render(toRenderInput(draft, lines, null), { mode: "none" }, "us");
    expect(r.ok && r.ingredients.map((i) => i.amount)).toEqual(["2", "½ cup", null, "1–2 tsp"]);
  });
});
