import { describe, expect, it } from "vitest";
import { bakingPowder, eggs, flour, ing, milk, PAN_9_ROUND, PAN_9X13, recipe } from "./fixtures";
import { render, sourceSystem, type RenderedIngredient } from "./render";
import type { RenderInput, ScaleState } from "./schemas";
import type { UnitSystem } from "./units";

/** Render one ingredient and return its rendered line. */
function one(i: Parameters<typeof recipe>[0][number], scale: ScaleState, units: UnitSystem, extra?: RenderInput["ingredients"]): RenderedIngredient {
  const r = render(recipe([i, ...(extra ?? [])]), scale, units);
  if (!r.ok) throw new Error(r.error);
  return r.ingredients[0];
}
const x = (factor: number): ScaleState => ({ mode: "factor", factor });
const NONE: ScaleState = { mode: "none" };

describe("doc examples", () => {
  it("2.5 eggs → '2 eggs + 2 tbsp beaten egg'", () => {
    const r = one(eggs(1), x(2.5), "us");
    expect(r.amount).toBe("2 eggs + 2 tbsp beaten egg");
    expect(r.amountIncludesName).toBe(true);
    expect(r.original).toBe("1");
  });

  it("18 tsp → '⅓ cup + 2 tsp'", () => {
    expect(one(ing({ name: "sugar", quantity: 6, unitCode: "tsp" }), x(3), "us").amount).toBe("⅓ cup + 2 tsp");
  });

  it("0.0625 cup → '1 tbsp'", () => {
    expect(one(ing({ name: "oil", quantity: 0.125, unitCode: "cup" }), x(0.5), "us").amount).toBe("1 tbsp");
  });
});

describe("rule 9: factor 1 in the source system is the original, as entered", () => {
  it("no re-laddering, no 'orig.' label", () => {
    const r = one(ing({ name: "sugar", quantity: 6, unitCode: "tsp" }), NONE, "us");
    expect(r.amount).toBe("6 tsp");
    expect(r.original).toBeNull();
  });

  it("a metric line inside a US recipe stays as entered", () => {
    const r = render(recipe([flour(1), flour(2), ing({ name: "chocolate", quantity: 100, unitCode: "g" })]), NONE, "us");
    expect(r.ok && r.ingredients.map((i) => i.amount)).toEqual(["1 cup", "2 cups", "100 g"]);
  });

  it("factor 1 in the other system converts", () => {
    const r = one(flour(1), NONE, "metric");
    expect(r.amount).toBe("120 g");
    expect(r.original).toBe("1 cup");
  });

  it("scaling sets 'orig.'", () => {
    const r = one(flour(1.5), x(2), "us");
    expect(r.amount).toBe("3 cups");
    expect(r.original).toBe("1½ cups");
  });

  it("scaling with no visible change does not set 'orig.'", () => {
    // 1 cup × 1.01 = 1.01 cup → snaps to 1 cup
    expect(one(flour(1), x(1.01), "us").original).toBeNull();
  });
});

describe("unit conversion", () => {
  it("1 cup flour → 120 g; 1 cup milk → 235 ml", () => {
    expect(one(flour(1), x(1), "metric").amount).toBe("120 g");
    expect(one(milk(1), x(1), "metric").amount).toBe("235 ml");
  });

  it("100 g chocolate without density → oz in US, never cups", () => {
    const r = one(ing({ name: "chocolate", quantity: 100, unitCode: "g" }), NONE, "us");
    expect(r.amount).toBe("3½ oz"); // 3.527 oz
  });

  it("113 g butter with density → ½ cup in US", () => {
    const butter = ing({ name: "butter", quantity: 113, unitCode: "g", densityGPerMl: 0.959 });
    expect(one(butter, NONE, "us").amount).toBe("½ cup");
  });

  it("2 lb flour → 905 g; 2.5 kg flour in US → 20¾ cups (by density)", () => {
    expect(one(flour(2, "lb"), NONE, "metric").amount).toBe("905 g"); // 907.18 g, 5 g steps
    expect(one(flour(2.5, "kg"), NONE, "us").amount).toBe("20¾ cups"); // 2500 / 0.5072 / 236.588 = 20.83
  });
});

describe("rules 6–7: counts", () => {
  it("eggs: whole counts and remainders", () => {
    expect(one(eggs(2), x(1.5), "us").amount).toBe("3 eggs");
    expect(one(eggs(2), x(1.1), "us").amount).toBe("2 eggs"); // 2.2: remainder < ¼ rounds down
    expect(one(eggs(1), x(2.25), "us").amount).toBe("2 eggs + 1 tbsp beaten egg");
    expect(one(eggs(1), x(1.8), "us").amount).toBe("2 eggs"); // remainder > ¾ rounds up
    expect(one(eggs(1), x(1), "us").amount).toBe("1");          // original: as entered
  });

  it("eggs: never '0 eggs' (rule 6)", () => {
    // 2 × 0.1 = 0.2 egg → 0.8 tbsp = 2.4 tsp → 2⅓ tsp
    expect(one(eggs(2), x(0.1), "us").amount).toBe("2⅓ tsp beaten egg");
    expect(one(eggs(1), x(0.5), "us").amount).toBe("2 tbsp beaten egg");
  });

  it("eggs in metric: beaten remainder in grams via each_g", () => {
    expect(one(eggs(1), x(2.5), "metric").amount).toBe("2 eggs + 25 g beaten egg");
    const noEachG = { ...eggs(1), eachG: null };
    expect(one(noEachG, x(2.5), "metric").amount).toBe("2 eggs + 30 ml beaten egg"); // 2 tbsp = 29.6 ml
  });

  it("other count_round items round to the nearest ½", () => {
    const bananas = ing({ name: "bananas", quantity: 3, rule: "count_round" });
    expect(one(bananas, x(0.8), "us").amount).toBe("2½");
  });

  it("linear counts use fractions, never 0", () => {
    expect(one(ing({ name: "onion", quantity: 1 }), x(0.5), "us").amount).toBe("½");
    expect(one(ing({ name: "onion", quantity: 1 }), x(0.02), "us").amount).toBe("⅛");
  });
});

describe("rule 10: to_taste and fixed", () => {
  it("no quantity → no amount", () => {
    const salt = ing({ name: "salt", rule: "to_taste" });
    expect(one(salt, x(3), "us")).toMatchObject({ amount: null, original: null });
  });

  it("are not scaled, and stay as entered in their own system", () => {
    expect(one(ing({ name: "salt", quantity: 1, unitCode: "tsp", rule: "to_taste" }), x(3), "us").amount).toBe("1 tsp");
    expect(one(ing({ name: "bay leaf", quantity: 1, rule: "fixed" }), x(3), "us").amount).toBe("1");
  });

  it("are still converted to the other system", () => {
    const r = one(ing({ name: "salt", quantity: 1, unitCode: "tsp", rule: "to_taste" }), x(3), "metric");
    expect(r.amount).toBe("5 ml");
    expect(r.original).toBe("1 tsp");
  });
});

describe("rule 11: ranges", () => {
  it("counts scale both ends", () => {
    expect(one(ing({ name: "garlic cloves", quantity: 2, quantityMax: 3 }), x(2), "us").amount).toBe("4–6");
  });

  it("units are shared and picked from the larger end", () => {
    const r = one(ing({ name: "stock", quantity: 1, quantityMax: 1.5, unitCode: "cup" }), x(2), "us");
    expect(r.amount).toBe("2–3 cups");
    // ½–¾ tbsp ×2 = 1–1.5 tbsp → larger end picks tbsp
    expect(one(ing({ name: "x", quantity: 0.5, quantityMax: 0.75, unitCode: "tbsp" }), x(2), "us").amount).toBe("1–1½ tbsp");
  });

  it("metric ranges switch to kg from the larger end", () => {
    const r = one(ing({ name: "potatoes", quantity: 200, quantityMax: 250, unitCode: "g" }), x(5), "metric");
    expect(r.amount).toBe("1–1.25 kg");
    const small = one(ing({ name: "potatoes", quantity: 200, quantityMax: 250, unitCode: "g" }), x(2), "metric");
    expect(small.amount).toBe("400–500 g");
  });

  it("count_round ranges round each end (eggs to whole eggs)", () => {
    expect(one({ ...eggs(2), quantityMax: 3 }, x(1.5), "us").amount).toBe("3–5"); // 3–4.5 → 3–5
    const bananas = ing({ name: "bananas", quantity: 2, quantityMax: 3, rule: "count_round" });
    expect(one(bananas, x(0.6), "us").amount).toBe("1–2"); // 1.2–1.8 → 1–2
  });

  it("tiny ranges", () => {
    expect(one(ing({ name: "x", quantity: 0.01, quantityMax: 0.02, unitCode: "tsp" }), x(0.5), "us").amount).toBe("pinch");
    expect(one(ing({ name: "x", quantity: 0.1, quantityMax: 0.2, unitCode: "g" }), x(0.5), "metric").amount).toBe("<0.5 g");
  });
});

describe("recipe-level output", () => {
  it("leavening is flagged per ingredient and as a warning", () => {
    const r = render(recipe([flour(1), bakingPowder(1)]), x(3), "us");
    expect(r.ok && r.warnings).toEqual(["LEAVENING_EXTREME"]);
    expect(r.ok && r.ingredients.map((i) => i.leaveningWarning)).toEqual([false, true]);
  });

  it("pan mode passes the factor, warnings and bake hint through", () => {
    const deep9x13 = { ...PAN_9X13, depthCm: 7.62 };
    const r = render(recipe([flour(1)], { pan: PAN_9_ROUND }), { mode: "pan", targetPanId: deep9x13.id, useDepth: false }, "us", { pans: [deep9x13] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.factor).toBeCloseTo(1.84, 2);
      expect(r.warnings).toEqual(expect.arrayContaining(["SHAPE_CHANGE", "BAKE_TIME_CHANGES"]));
      expect(r.bakeHint).toEqual({ direction: "deeper" });
      // 1.839 cups → 1¾ is 4.85% off: within the 5% threshold, so one part
      expect(r.ingredients[0].amount).toBe("1¾ cups");
    }
  });

  it("9 in round → 9×13: 2 eggs and ½ cup flour read as a cook would measure them", () => {
    const r = render(recipe([eggs(2), flour(0.5)], { pan: PAN_9_ROUND }), { mode: "pan", targetPanId: PAN_9X13.id, useDepth: false }, "us", { pans: [PAN_9X13] });
    expect(r.ok && r.ingredients.map((i) => i.amount)).toEqual([
      "4 eggs",           // 3.68 eggs: 3+ whole eggs round to the nearest whole (was "3 eggs + 2¾ tbsp beaten egg")
      "¾ cup + 2½ tbsp",  // 0.92 cup: second part in whole/½ units (was "¾ cup + 2¾ tbsp")
    ]);
  });

  it("errors pass through", () => {
    expect(render(recipe([flour(1)]), { mode: "yield", targetQty: 2 }, "us")).toEqual({ ok: false, error: "NO_YIELD" });
  });

  it("keeps name and preparation", () => {
    const r = one(ing({ name: "flour", quantity: 1, unitCode: "cup", preparation: "sifted" }), NONE, "us");
    expect(r).toMatchObject({ name: "flour", preparation: "sifted", amountIncludesName: false });
  });
});

describe("purity", () => {
  const deepFreeze = <T>(o: T): T => {
    if (o && typeof o === "object") {
      Object.values(o).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };

  it("never mutates its input and is deterministic", () => {
    const input = deepFreeze(
      recipe([flour(1.5), milk(1), eggs(2), bakingPowder(1), ing({ name: "salt", rule: "to_taste" })], { yieldQty: 24, pan: PAN_9_ROUND }),
    );
    const scales: ScaleState[] = [NONE, x(2.5), { mode: "yield", targetQty: 12 }, { mode: "pan", targetPanId: PAN_9X13.id, useDepth: true }];
    for (const s of scales) {
      for (const u of ["us", "metric"] as const) {
        const a = render(input, s, u, { pans: [PAN_9X13] });
        const b = render(input, s, u, { pans: [PAN_9X13] });
        expect(a).toEqual(b);
      }
    }
  });
});

describe("sourceSystem", () => {
  it("majority of entered units; ties and unit-less recipes are US", () => {
    expect(sourceSystem(recipe([flour(1, "g"), flour(1, "g"), flour(1, "cup")]))).toBe("metric");
    expect(sourceSystem(recipe([flour(1, "g"), flour(1, "cup")]))).toBe("us");
    expect(sourceSystem(recipe([eggs(2)]))).toBe("us");
  });
});
