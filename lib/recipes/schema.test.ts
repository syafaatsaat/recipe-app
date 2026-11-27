import { describe, expect, it } from "vitest";
import {
  cToFahrenheit,
  enteredOven,
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
    ["empty step", draft({ steps: [{ body: " ", photoId: null }] }), "Write the step"],
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

  it("reads a version saved before the oven unit was kept", () => {
    const old: Record<string, unknown> = { ...recipeDraftSchema.parse({ ...draft(), ovenTempC: 176.7 }) };
    delete old.ovenUnit;
    expect(recipeSnapshotSchema.parse({ schema: 1, draft: old }).draft.ovenUnit).toBeNull();
  });
});

describe("conversions", () => {
  it("oven: 350 °F ↔ 176.7 °C, shown back as 350", () => {
    expect(fahrenheitToC(350)).toBe(176.7);
    expect(cToFahrenheit(176.7)).toBe(350);
    expect(cToFahrenheit(180)).toBe(355);
    expect(enteredOven(176.7, "F")).toBe(350);
    expect(enteredOven(177.8, "F")).toBe(352);
    expect(enteredOven(180, "C")).toBe(180);
    expect(enteredOven(182.5, "C")).toBe(182.5);
  });

  it("grams per cup → g/ml with 4 decimals (fits numeric(6,4))", () => {
    expect(gramsPerCupToDensity(120)).toBe(0.5072);
    expect(gramsPerCupToDensity(236.5882365)).toBe(1);
  });
});

describe("photos in the draft", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const ref = (id: string) => ({ id, width: 1600, height: 1200, alt: null });
  const steps = (a: string | null, b: string | null) => [{ body: "Mix.", photoId: a }, { body: "Bake.", photoId: b }];

  it("old drafts without photos still read (v1 snapshots)", () => {
    const { photos, coverPhotoId, ...old } = draft();
    void photos;
    void coverPhotoId;
    const r = recipeDraftSchema.parse({ ...old, steps: [{ body: "Mix." }] });
    expect(r).toMatchObject({ photos: [], coverPhotoId: null, steps: [{ body: "Mix.", photoId: null }] });
  });

  it("accepts a cover and a step photo, and an imported photo without a size", () => {
    const r = recipeDraftSchema.safeParse(draft({ photos: [{ id: A, width: null, height: null, alt: " Cake " }, ref(B)], coverPhotoId: A, steps: steps(null, B) }));
    expect(r.success && r.data.photos[0].alt).toBe("Cake");
  });

  it.each([
    ["an unknown cover", { photos: [], coverPhotoId: A }],
    ["an unknown step photo", { photos: [], steps: steps(A, null) }],
    ["a photo used twice", { photos: [ref(A)], coverPhotoId: A, steps: steps(A, null) }],
    ["two steps sharing one", { photos: [ref(A)], steps: steps(A, A) }],
    ["a photo nobody uses", { photos: [ref(A)] }],
    ["a photo listed twice", { photos: [ref(A), ref(A)], coverPhotoId: A }],
    ["a photo bigger than an upload can be", { photos: [{ ...ref(A), width: 4000 }], coverPhotoId: A }],
  ])("refuses %s", (_, over) => {
    expect(recipeDraftSchema.safeParse(draft(over as Partial<RecipeDraft>)).success).toBe(false);
  });
});

