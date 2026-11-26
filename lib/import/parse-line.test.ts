import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FLAG_BELOW, ingredientCandidates, parseLine, type ParsedFields } from "./parse-line";

type Expect = Partial<ParsedFields> & { flagged?: boolean };

// Representative lines written for these tests (not copied from any site).
const CASES: [string, Expect][] = [
  // plain amounts and units
  ["2 cups all-purpose flour", { quantity: 2, unitCode: "cup", name: "all-purpose flour", flagged: false }],
  ["1 cup granulated sugar", { quantity: 1, unitCode: "cup", name: "granulated sugar" }],
  ["1½ cups milk", { quantity: 1.5, unitCode: "cup", name: "milk" }],
  ["1 ½ cups milk", { quantity: 1.5, unitCode: "cup" }],
  ["1 1/2 cups milk", { quantity: 1.5, unitCode: "cup" }],
  ["1-1/2 cups milk", { quantity: 1.5, unitCode: "cup" }],
  ["1⁄2 cup cream", { quantity: 0.5, unitCode: "cup", name: "cream" }],
  [".5 cup cream", { quantity: 0.5, unitCode: "cup" }],
  ["0.75 cup oil", { quantity: 0.75, unitCode: "cup" }],
  ["¾ cup extra-virgin olive oil", { quantity: 0.75, unitCode: "cup", name: "extra-virgin olive oil" }],
  ["2 tbsp butter", { quantity: 2, unitCode: "tbsp", name: "butter" }],
  ["2 Tbsp. butter", { quantity: 2, unitCode: "tbsp" }],
  ["1 T butter", { quantity: 1, unitCode: "tbsp" }],
  ["1 t vanilla", { quantity: 1, unitCode: "tsp", name: "vanilla" }],
  ["1 teaspoon vanilla extract", { quantity: 1, unitCode: "tsp", name: "vanilla extract" }],
  ["3 tablespoons honey", { quantity: 3, unitCode: "tbsp", name: "honey" }],
  ["2 c. flour", { quantity: 2, unitCode: "cup", name: "flour" }],
  ["8 fl oz cream", { quantity: 8, unitCode: "fl_oz", name: "cream" }],
  ["1 pint strawberries", { quantity: 1, unitCode: "pint", name: "strawberries" }],
  ["1 lb ground beef", { quantity: 1, unitCode: "lb", name: "ground beef" }],
  ["8 ounces cream cheese, softened", { quantity: 8, unitCode: "oz", name: "cream cheese", preparation: "softened" }],
  ["2 cups of flour", { quantity: 2, unitCode: "cup", name: "flour" }],
  // metric, glued units
  ["200g dark chocolate, chopped", { quantity: 200, unitCode: "g", name: "dark chocolate", preparation: "chopped" }],
  ["250 ml whole milk", { quantity: 250, unitCode: "ml", name: "whole milk" }],
  ["1 L water", { quantity: 1, unitCode: "l", name: "water" }],
  ["1.5 kg potatoes", { quantity: 1.5, unitCode: "kg", name: "potatoes" }],
  ["500 grams strong flour", { quantity: 500, unitCode: "g", name: "strong flour" }],
  // counts (no unit)
  ["3 large eggs, room temperature", { quantity: 3, unitCode: null, name: "large eggs", preparation: "room temperature" }],
  ["2 eggs", { quantity: 2, unitCode: null, name: "eggs" }],
  ["1 lemon", { quantity: 1, unitCode: null, name: "lemon" }],
  ["2 cloves garlic, minced", { quantity: 2, unitCode: null, name: "cloves garlic", preparation: "minced" }],
  ["1 onion, finely diced", { quantity: 1, name: "onion", preparation: "finely diced" }],
  ["4 sprigs thyme", { quantity: 4, name: "sprigs thyme" }],
  // ranges
  ["2-3 cloves garlic", { quantity: 2, quantityMax: 3, name: "cloves garlic" }],
  ["2–3 tbsp water", { quantity: 2, quantityMax: 3, unitCode: "tbsp" }],
  ["1 to 2 tsp chili flakes", { quantity: 1, quantityMax: 2, unitCode: "tsp", name: "chili flakes" }],
  // brackets
  ["1¾ cups (210g) all-purpose flour", { quantity: 1.75, unitCode: "cup", name: "all-purpose flour", note: "210g", flagged: false }],
  ["1 cup (120 g) flour, sifted", { quantity: 1, unitCode: "cup", name: "flour", preparation: "sifted", note: "120 g" }],
  ["2 (14 oz) cans diced tomatoes", { quantity: 2, unitCode: null, name: "cans diced tomatoes", note: "14 oz", flagged: true }],
  ["1 can coconut milk", { quantity: 1, name: "can coconut milk", flagged: false }],
  ["1 cup walnuts (toasted)", { quantity: 1, unitCode: "cup", name: "walnuts", note: "toasted" }],
  // stick of butter (§3.6)
  ["1 stick butter, softened", { quantity: 4, unitCode: "oz", name: "butter", preparation: "softened", flagged: false }],
  ["1½ sticks unsalted butter", { quantity: 6, unitCode: "oz", name: "unsalted butter" }],
  ["2 sticks margarine", { quantity: 8, unitCode: "oz", name: "margarine" }],
  ["1 stick cinnamon", { quantity: 1, unitCode: null, name: "stick cinnamon", flagged: true }],
  // pinch & co (§3.9)
  ["Pinch of flaky salt", { quantity: null, name: "flaky salt", note: "pinch", flagged: false }],
  ["a pinch of salt", { quantity: null, name: "salt", note: "pinch" }],
  ["2 pinches nutmeg", { quantity: null, name: "nutmeg", note: "2 pinches" }],
  ["dash of hot sauce", { quantity: null, name: "hot sauce", note: "dash" }],
  ["Salt and pepper, to taste", { quantity: null, name: "Salt and pepper", note: "to taste", flagged: false }],
  ["salt to taste", { quantity: null, name: "salt", note: "to taste" }],
  ["Fresh parsley, for garnish", { quantity: null, name: "Fresh parsley", preparation: "for garnish" }],
  ["flaky salt, for the top", { quantity: null, name: "flaky salt", preparation: "for the top" }],
  ["oil as needed", { quantity: null, name: "oil", note: "as needed" }],
  // optional
  ["1 tsp espresso powder (optional)", { quantity: 1, unitCode: "tsp", name: "espresso powder", isOptional: true }],
  ["½ cup chocolate chips, optional", { quantity: 0.5, name: "chocolate chips", isOptional: true }],
  // zest / juice
  ["Zest of 2 lemons", { quantity: 2, name: "lemons", preparation: "zested", flagged: true }],
  ["Juice of 1 lime", { quantity: 1, name: "lime", preparation: "juiced", flagged: true }],
  ["zest and juice of 1 orange", { quantity: 1, name: "orange", preparation: "zested and juiced" }],
  // bullets and stray whitespace
  ["• 2 cups flour", { quantity: 2, unitCode: "cup", name: "flour" }],
  ["  -  1 cup  sugar ", { quantity: 1, unitCode: "cup", name: "sugar" }],
  ["▢ 1 tsp salt", { quantity: 1, unitCode: "tsp", name: "salt" }],
  // things to check
  ["fresh basil leaves", { quantity: null, name: "fresh basil leaves", flagged: true }],
  ["2 eggs plus 1 yolk", { quantity: 2, flagged: true }],
  ["1 cup butter or margarine", { quantity: 1, unitCode: "cup", name: "butter or margarine", flagged: false }],
];

describe("parseLine", () => {
  it.each(CASES)("%s", (raw, want) => {
    const r = parseLine(raw);
    const { flagged, ...fields } = want;
    expect(r.fields).toMatchObject(fields);
    expect(r.raw).toBe(raw);
    if (flagged !== undefined) expect(r.confidence < FLAG_BELOW).toBe(flagged);
  });

  it("says why a stick became ounces", () => {
    expect(parseLine("1 stick butter").info).toEqual(["1 stick = 4 oz"]);
    expect(parseLine("2 sticks butter").info).toEqual(["A stick = 4 oz"]);
    expect(parseLine("1-2 sticks butter").fields).toMatchObject({ quantity: 4, quantityMax: 8 });
  });

  it("offers a one-tap fix only on flagged lines", () => {
    expect(parseLine("Zest of 2 lemons").fix).toEqual({ text: "Read as 2 lemons, zested. Is that right?", label: "Looks right" });
    expect(parseLine("1 stick cinnamon").fix?.label).toBe("Keep as written");
    expect(parseLine("2 (14 oz) cans tomatoes").fix).toEqual({ text: "Counted in cans of 14 oz.", label: "Looks right" });
    expect(parseLine("basil").fix).toEqual({ text: "No amount found, so it’s kept like “to taste”.", label: "Keep" });
    expect(parseLine("2 eggs plus 1 yolk").fix?.label).toBe("Keep as read");
    expect(parseLine("2 cups flour").fix).toBeNull();
  });

  it("keeps an amount it can't read in the note, with low confidence", () => {
    const r = parseLine("0 cups flour");
    expect(r.fields).toMatchObject({ quantity: null, note: "0" });
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("falls back to the raw text when nothing is left for a name", () => {
    const r = parseLine("2 cups");
    expect(r.fields.name).toBe("2 cups");
    expect(r.confidence).toBeLessThan(0.3);
  });

  it("trims long fields to what the schema allows", () => {
    const r = parseLine(`1 cup ${"very ".repeat(60)}long name`);
    expect(r.fields.name.length).toBeLessThanOrEqual(200);
    expect(r.confidence).toBeLessThan(FLAG_BELOW);
  });

  it("never throws, always keeps the raw text, and returns a valid confidence", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (s) => {
        const r = parseLine(s);
        expect(r.raw).toBe(s);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        expect(r.fields.name.length).toBeGreaterThan(0);
        if (r.fields.quantityMax !== null) expect(r.fields.quantity).not.toBeNull();
      }),
    );
  });
});

describe("ingredientCandidates", () => {
  it("goes from specific to general", () => {
    expect(ingredientCandidates("Extra-virgin olive oil")).toEqual([
      "extra-virgin olive oil", "extra virgin olive oil", "olive oil", "oil", "virgin olive oil",
    ]);
  });

  it("drops size words and tries the singular", () => {
    const c = ingredientCandidates("large eggs");
    expect(c.slice(0, 3)).toEqual(["large eggs", "eggs", "large egg"]);
    expect(c).toContain("egg");
    expect(ingredientCandidates("lemons")).toEqual(["lemons", "lemon"]);
    expect(ingredientCandidates("cherries")).toContain("cherry");
    expect(ingredientCandidates("peaches")).toContain("peach");
    expect(ingredientCandidates("molasses")).toEqual(["molasses"]);
  });

  it("ignores brackets", () => {
    expect(ingredientCandidates("flour (sifted)")[0]).toBe("flour");
  });
});
