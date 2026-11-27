import { describe, expect, it } from "vitest";
import { issuesToErrors, move, newLine, toDraft, toEditorState, type EditorState } from "./editor-state";
import type { CatalogIngredient } from "./render-input";
import { emptyDraft, emptyLine, type RecipeDraft } from "./schema";

const FLOUR: CatalogIngredient = {
  id: "3f1e6a2c-8d4b-4c1a-9e2f-5b7d0c6a1f10", name: "all-purpose flour", mine: false, densityGPerMl: 0.5072,
  eachG: null, defaultScalingRule: "linear", preferMassInMetric: true, isEgg: false,
};

const draft: RecipeDraft = {
  ...emptyDraft(),
  title: "Brownies",
  description: "Crackly top.",
  yieldQty: 12,
  yieldUnit: "squares",
  prepMin: 15,
  cookMin: 25,
  ovenTempC: 176.7,
  sections: [{
    title: null,
    ingredients: [
      { ...emptyLine(), name: "flour", quantity: 1.5, unitCode: "cup", ingredientId: FLOUR.id, preparation: "sifted" },
      { ...emptyLine(), name: "espresso powder", quantity: 1, quantityMax: 2, unitCode: "tsp", isOptional: true, note: "or coffee", scalingRule: "fixed" },
      { ...emptyLine(), name: "flaky salt" },
    ],
  }],
  steps: [{ body: "Mix.", photoId: null }, { body: "Bake.", photoId: null }],
};

const state = () => toEditorState(draft, { [FLOUR.id]: FLOUR });
const ok = (s: EditorState) => {
  const r = toDraft(s);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.draft;
};
const errs = (s: EditorState) => {
  const r = toDraft(s);
  if (r.ok) throw new Error("expected errors");
  return r.errors;
};

describe("toEditorState → toDraft", () => {
  it("shows stored values as typed text", () => {
    const s = state();
    expect(s).toMatchObject({ yieldQty: "12", prepMin: "15", ovenTemp: "350", ovenUnit: "F" });
    expect(s.sections[0].lines.map((l) => l.amount)).toEqual(["1 1/2", "1–2", ""]);
    expect(s.sections[0].lines[0].ingredient).toEqual(FLOUR);
  });

  it("round-trips a draft unchanged (an oven of unknown unit is taken as °F)", () => {
    expect(ok(state())).toEqual({ ...draft, ovenTempC: 176.7, ovenUnit: "F" });
  });

  it("reopens the oven in the unit it was entered in", () => {
    const c = toEditorState({ ...draft, ovenTempC: 180, ovenUnit: "C" }, {});
    expect(c).toMatchObject({ ovenTemp: "180", ovenUnit: "C" });
    expect(ok(c)).toMatchObject({ ovenTempC: 180, ovenUnit: "C" });
    // °F comes back to the degree, not rounded to 5
    const f = toEditorState({ ...draft, ovenTempC: 177.8, ovenUnit: "F" }, {});
    expect(f).toMatchObject({ ovenTemp: "352", ovenUnit: "F" });
  });

  it("drops blank lines and empty steps, keeps °C as typed", () => {
    const s = state();
    s.sections[0].lines.push(newLine());
    s.steps.push({ key: "x", body: "  ", photoId: null });
    s.ovenUnit = "C";
    s.ovenTemp = "180";
    s.prepMin = "";
    s.yieldQty = "";
    const d = ok(s);
    expect(d.sections[0].ingredients).toHaveLength(3);
    expect(d.steps).toHaveLength(2);
    expect(d).toMatchObject({ ovenTempC: 180, ovenUnit: "C", prepMin: null, yieldQty: null });
  });

  it("reports field errors by key", () => {
    const s = state();
    const [flour, espresso] = s.sections[0].lines;
    flour.amount = "lots";
    espresso.name = " ";
    s.sections[0].lines.push({ ...newLine(), key: "u", unitCode: "cup", name: "sugar" });
    s.title = "";
    s.yieldQty = "2-3";
    s.prepMin = "1.5";
    s.cookMin = "abc";
    s.ovenTemp = "-4";
    expect(errs(s)).toEqual({
      title: "Give the recipe a title.",
      yieldQty: "Use one number for how many it makes.",
      prepMin: "Whole minutes, like 25.",
      cookMin: "Whole minutes, like 25.",
      ovenTemp: "Enter an oven temperature, like 350.",
      [`line:${flour.key}:amount`]: expect.stringContaining("Use a number"),
      [`line:${espresso.key}:name`]: "Name the ingredient.",
      "line:u:amount": "Add an amount for the unit, or clear the unit.",
    });
  });

  it("rejects a bad yield and needs section titles once there are two", () => {
    const s = state();
    s.yieldQty = "x";
    s.sections.push({ key: "s2", title: "", lines: [] });
    expect(errs(s)).toMatchObject({ yieldQty: expect.any(String), "section:s2:title": "Name this section." });
  });

  it("falls back to schema issues the field checks don't cover", () => {
    const s = state();
    s.sections[0].lines[0].name = "x".repeat(201);
    expect(errs(s)).toEqual({ [`line:${s.sections[0].lines[0].key}:name`]: expect.any(String) });
  });
});

describe("issuesToErrors", () => {
  it("maps server issue paths to field keys, skipping blank lines", () => {
    const s = state();
    s.sections[0].lines.unshift(newLine()); // blank, dropped on save
    s.sections.push({ key: "s2", title: "Topping", lines: [] });
    s.steps.unshift({ key: "blank", body: "", photoId: null });
    const [, flour, espresso] = s.sections[0].lines;
    expect(
      issuesToErrors(s, [
        { path: "sections.0.ingredients.0.name", message: "a" },
        { path: ["sections", 0, "ingredients", 1, "quantityMax"], message: "b" },
        { path: "sections.0.ingredients.0.preparation", message: "c" },
        { path: "sections.1.title", message: "d" },
        { path: "steps.1", message: "e" },
        { path: "ovenTempC", message: "f" },
        { path: "title", message: "g" },
        { path: "sections", message: "h" },
        { path: "sections.9.ingredients.0.name", message: "i" },
      ]),
    ).toEqual({
      [`line:${flour.key}:name`]: "a",
      [`line:${espresso.key}:amount`]: "b",
      [`line:${flour.key}:preparation`]: "c",
      "section:s2:title": "d",
      [`step:${s.steps[2].key}`]: "e",
      ovenTemp: "f",
      title: "g",
      form: "h",
    });
  });
});

describe("move", () => {
  it("swaps neighbours and ignores moves off either end", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 5, -1)).toEqual([1, 2, 3]);
  });
});

describe("photos in the editor", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const withPhotos: RecipeDraft = {
    ...draft,
    photos: [{ id: A, width: 1600, height: 1200, alt: "Brownies" }, { id: B, width: 1200, height: 1600, alt: null }],
    coverPhotoId: A,
    steps: [{ body: "Mix.", photoId: null }, { body: "Bake.", photoId: B }],
  };

  it("round-trips, with the URLs it's given", () => {
    const s = toEditorState(withPhotos, { [FLOUR.id]: FLOUR }, { [A]: { src: "https://s/full", thumbSrc: "https://s/thumb", imported: false } });
    expect(s.photos[A]).toMatchObject({ alt: "Brownies", src: "https://s/full", thumbSrc: "https://s/thumb" });
    expect(s.photos[B]).toMatchObject({ alt: "", src: null, imported: false });
    expect(ok(s)).toMatchObject({ photos: withPhotos.photos, coverPhotoId: A, steps: withPhotos.steps });
  });

  it("keeps a photo with its step when steps move, and drops photos no longer used", () => {
    const s = toEditorState(withPhotos, { [FLOUR.id]: FLOUR });
    s.steps = move(s.steps, 1, -1);
    expect(ok(s).steps).toEqual([{ body: "Bake.", photoId: B }, { body: "Mix.", photoId: null }]);
    s.coverPhotoId = null;
    s.steps[0].body = " "; // a blank step goes, and its photo with it
    expect(ok(s)).toMatchObject({ photos: [], coverPhotoId: null });
  });

  it("ignores a reference to a photo it doesn't know", () => {
    const s = toEditorState(draft, { [FLOUR.id]: FLOUR });
    s.coverPhotoId = A;
    s.steps[0].photoId = B;
    expect(ok(s)).toMatchObject({ photos: [], coverPhotoId: null, steps: [{ body: "Mix.", photoId: null }, { body: "Bake.", photoId: null }] });
  });

  it("puts photo errors on the photos field", () => {
    expect(issuesToErrors(state(), [{ path: ["photos"], message: "A photo can be used once." }])).toEqual({ photos: "A photo can be used once." });
  });
});

