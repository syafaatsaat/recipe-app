import { describe, expect, it } from "vitest";
import {
  cToFahrenheit,
  emptyDraft,
  emptyLine,
  fahrenheitToC,
  gramsPerCupToDensity,
  recipeDraftSchema,
  recipeSnapshotSchema,
  type RecipeDraft,
} from "./schema";

const line = (over = {}) => ({ ...emptyLine(), name: "flour", ...over });
const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  ...emptyDraft(),
  title: "Brownies",
  sections: [{ title: null, ingredients: [line({ quantity: 0.5, unitCode: "cup" })] }],
  ...over,
});

describe("recipeDraftSchema", () => {
  it("accepts a minimal recipe", () => {
    expect(recipeDraftSchema.safeParse(draft()).success).toBe(true);
  });

  it("trims text and turns empty optional text into null", () => {
    const r = recipeDraftSchema.parse(
      draft({ title: "  Brownies ", description: "   ", sections: [{ title: null, ingredients: [line({ preparation: " melted " })] }] }),
    );
    expect(r.title).toBe("Brownies");
    expect(r.description).toBeNull();
    expect(r.sections[0].ingredients[0].preparation).toBe("melted");
  });

  it.each([
    ["no title", draft({ title: "  " }), "title"],
    ["unnamed ingredient", draft({ sections: [{ title: null, ingredients: [line({ name: " " })] }] }), "Name the ingredient"],
    ["range without a start", draft({ sections: [{ title: null, ingredients: [line({ quantityMax: 2 })] }] }), "range"],
    ["range backwards", draft({ sections: [{ title: null, ingredients: [line({ quantity: 3, quantityMax: 2 })] }] }), "range"],
    ["zero amount", draft({ sections: [{ title: null, ingredients: [line({ quantity: 0 })] }] }), ""],
    ["unknown unit", draft({ sections: [{ title: null, ingredients: [line({ unitCode: "stick" as never })] }] }), ""],
    ["no sections", draft({ sections: [] }), ""],
    ["empty step", draft({ steps: [{ body: " " }] }), "Write the step"],
    [
      "untitled section among several",
      draft({ sections: [{ title: "Batter", ingredients: [] }, { title: null, ingredients: [] }] }),
      "every section needs a title",
    ],
    ["not a uuid", draft({ panId: "9x13" }), ""],
  ])("rejects %s", (_, d, message) => {
    const r = recipeDraftSchema.safeParse(d);
    expect(r.success).toBe(false);
    if (!r.success && message) expect(r.error.issues.map((i) => i.message).join(" ")).toContain(message);
  });

  it("allows titled sections", () => {
    const d = draft({ sections: [{ title: "Batter", ingredients: [line()] }, { title: "Topping", ingredients: [] }] });
    expect(recipeDraftSchema.safeParse(d).success).toBe(true);
  });
});

describe("snapshot", () => {
  it("wraps a draft with a schema version", () => {
    const d = recipeDraftSchema.parse(draft());
    expect(recipeSnapshotSchema.parse(JSON.parse(JSON.stringify({ schema: 1, draft: d })))).toEqual({ schema: 1, draft: d });
    expect(recipeSnapshotSchema.safeParse({ schema: 2, draft: d }).success).toBe(false);
  });
});

describe("conversions", () => {
  it("oven: 350 °F ↔ 176.7 °C, shown back as 350", () => {
    expect(fahrenheitToC(350)).toBe(176.7);
    expect(cToFahrenheit(176.7)).toBe(350);
    expect(cToFahrenheit(180)).toBe(355);
  });

  it("grams per cup → g/ml with 4 decimals (fits numeric(6,4))", () => {
    expect(gramsPerCupToDensity(120)).toBe(0.5072);
    expect(gramsPerCupToDensity(236.5882365)).toBe(1);
  });
});
