import { describe, expect, it } from "vitest";
import { lineKey, reviewedDraft, toImportDraft } from "./draft";
import { extractRecipe, extractedRecipeSchema } from "./extract";
import { BLOG_NO_DATA } from "./fixtures";
import { linesPrompt, pageMeta, pageText, recipePrompt, toExtracted, toHints, type LlmLines, type LlmRecipe } from "./llm";

const text = pageText(BLOG_NO_DATA);
const at = pageMeta(BLOG_NO_DATA, "https://weeknight.example/green-soup?ref=x");

const answer = (over: Partial<LlmRecipe> = {}): LlmRecipe => ({
  found: true,
  title: "Green soup",
  description: "A quick soup for cold nights, ready in half an hour and good for using up greens.",
  yieldText: "Serves 4",
  prepMinutes: 10,
  cookMinutes: 20,
  ingredients: [
    { section: null, text: "2 tbsp olive oil" },
    { section: null, text: "1 onion, chopped" },
    { section: null, text: "1 cup or 2 handfuls spinach" },
    { section: null, text: "4 cups vegetable stock" },
    { section: "To serve", text: "2 tbsp cream" },
  ],
  steps: [
    "Soften the onion in the olive oil for 8 minutes.",
    "Add the stock and simmer for 10 minutes, then stir in the spinach and blend.",
  ],
  ...over,
});

describe("pageText", () => {
  it("keeps the article, one block per line, without scripts, menus or footers", () => {
    expect(extractRecipe(BLOG_NO_DATA, null)).toBeNull();
    const lines = text.split("\n");
    expect(lines).toContain("1 cup or 2 handfuls spinach");
    expect(lines).toContain("Serves 4");
    expect(text).not.toMatch(/window\.ads|color:red|Soups|Subscribe|chilli/);
  });

  it("falls back to the body when there's no main or article, and caps the length", () => {
    const t = pageText(`<body><div>Line one</div><div>Line one</div><p>Line<br>two</p>${Array.from({ length: 9000 }, (_, i) => `<p>x${i}</p>`).join("")}</body>`);
    expect(t.startsWith("Line one\nLine\ntwo\nx0\nx1")).toBe(true);
    expect(t.length).toBe(40_000);
  });

  it("prompts wrap the untrusted text in tags", () => {
    expect(recipePrompt("abc")).toMatch(/^<page>\nabc\n<\/page>/);
    expect(linesPrompt(["a", "b"])).toBe("<lines>\n0: a\n1: b\n</lines>");
  });
});

describe("toExtracted", () => {
  it("keeps what the page says, with sections, site and canonical URL", () => {
    const r = toExtracted(answer(), text, at)!;
    expect(r.method).toBe("llm");
    expect(r.title).toBe("Green soup");
    expect(r.ingredients).toHaveLength(5);
    expect(r.ingredients[4]).toEqual({ section: "To serve", text: "2 tbsp cream" });
    expect(r.steps).toHaveLength(2);
    expect(r).toMatchObject({ yieldText: "Serves 4", prepMin: 10, cookMin: 20, siteName: "Weeknight Pot", url: "https://weeknight.example/green-soup", imageUrl: null });
    expect(extractedRecipeSchema.safeParse(r).success).toBe(true);
  });

  it("drops invented lines, invented steps and invented fields", () => {
    const r = toExtracted(
      answer({
        title: "Best soup ever",
        yieldText: "Serves 12",
        prepMinutes: -5,
        cookMinutes: 20_000,
        ingredients: [...answer().ingredients, { section: "Secret", text: "1 tsp truffle oil" }, { section: null, text: "  " }],
        steps: [...answer().steps, "Garnish with truffle shavings and gold leaf.", "!!!"],
      }),
      text,
      at,
    )!;
    expect(r.ingredients.map((i) => i.text)).not.toContain("1 tsp truffle oil");
    expect(r.ingredients).toHaveLength(5);
    expect(r.steps).toHaveLength(2);
    expect(r).toMatchObject({ title: null, yieldText: null, prepMin: null, cookMin: null });
  });

  it("an injected instruction in the page doesn't become an ingredient", () => {
    const r = toExtracted(answer({ ingredients: [...answer().ingredients, { section: null, text: "1 cup bleach" }] }), text, at)!;
    expect(r.ingredients.map((i) => i.text)).not.toContain("1 cup bleach");
  });

  it("accepts a line the page splits over a few elements", () => {
    const split = "<main><div>1</div><div>cup</div><div>flour</div><p>Mix it.</p></main>";
    const r = toExtracted(answer({ ingredients: [{ section: null, text: "1 cup flour" }], steps: ["Mix it."] }), pageText(split), at)!;
    expect(r.ingredients).toEqual([{ section: null, text: "1 cup flour" }]);
  });

  it("an unknown section heading is dropped, the line kept", () => {
    const r = toExtracted(answer({ ingredients: [{ section: "For the topping:", text: "2 tbsp cream" }] }), text, at)!;
    expect(r.ingredients).toEqual([{ section: null, text: "2 tbsp cream" }]);
  });

  it("null when there's no recipe or nothing survives", () => {
    expect(toExtracted(answer({ found: false }), text, at)).toBeNull();
    expect(toExtracted(answer({ ingredients: [{ section: null, text: "3 eggs" }] }), text, at)).toBeNull();
  });
});

describe("toHints", () => {
  const lines = ["1 cup or 2 handfuls spinach", "3 to 4 cloves garlic"];
  const reading = (over: Partial<LlmLines["lines"][number]> = {}): LlmLines["lines"][number] => ({
    index: 0, quantity: 1, quantityMax: null, unit: "cup", name: "spinach", preparation: null, note: "or 2 handfuls", optional: false, ...over,
  });

  it("keys valid readings by raw line", () => {
    const h = toHints(lines, { lines: [reading(), reading({ index: 1, quantity: 3, quantityMax: 4, unit: null, name: "cloves garlic", note: null })] });
    expect(h[lines[0]]).toEqual({ quantity: 1, quantityMax: null, unitCode: "cup", name: "spinach", preparation: null, note: "or 2 handfuls", isOptional: false });
    expect(h[lines[1]]).toMatchObject({ quantity: 3, quantityMax: 4 });
  });

  it("drops bad readings: unknown index, duplicates, invented words, impossible amounts, empty names", () => {
    expect(toHints(lines, { lines: [reading({ index: 7 })] })).toEqual({});
    expect(toHints(lines, { lines: [reading({ name: "baby kale" })] })).toEqual({});
    expect(toHints(lines, { lines: [reading({ quantity: 5e9 })] })).toEqual({});
    expect(toHints(lines, { lines: [reading({ quantity: -1 })] })).toEqual({});
    expect(toHints(lines, { lines: [reading({ name: "  " })] })).toEqual({});
    const h = toHints(lines, { lines: [reading(), reading({ name: "handfuls" })] });
    expect(h[lines[0]].name).toBe("spinach");
    // a range end below the start is ignored
    expect(toHints(lines, { lines: [reading({ quantityMax: 0.5 })] })[lines[0]].quantityMax).toBeNull();
  });
});

describe("hints on the review", () => {
  const extracted = { ...toExtracted(answer(), text, at)!, lineHints: toHints(["1 cup or 2 handfuls spinach", "2 tbsp olive oil"], {
    lines: [
      { index: 0, quantity: 1, quantityMax: null, unit: "cup", name: "spinach", preparation: null, note: "or 2 handfuls", optional: false },
      { index: 1, quantity: 2, quantityMax: null, unit: "tbsp", name: "olive oil", preparation: null, note: null, optional: false },
    ],
  }) };

  it("attaches a hint to a flagged line only", () => {
    const imp = toImportDraft(extracted);
    const lines = imp.parsed.flat();
    expect(lines.find((p) => p.raw === "1 cup or 2 handfuls spinach")!.suggestion).toMatchObject({ name: "spinach" });
    expect(lines.find((p) => p.raw === "2 tbsp olive oil")!.suggestion).toBeUndefined();
  });

  it("saves the suggestion only when chosen, keeping the original text", () => {
    const imp = toImportDraft(extracted);
    const none = { accepted: new Set<string>(), removedLines: new Set<string>(), removedSteps: new Set<number>() };
    const key = lineKey(0, 2);
    expect(reviewedDraft(imp.draft, none, imp.parsed).sections[0].ingredients[2].name).toBe("or 2 handfuls spinach");
    const line = reviewedDraft(imp.draft, { ...none, suggested: new Set([key]), suggestionMatches: new Map([[key, "00000000-0000-4000-8000-000000000001"]]) }, imp.parsed)
      .sections[0].ingredients[2];
    expect(line).toMatchObject({ quantity: 1, unitCode: "cup", name: "spinach", note: "or 2 handfuls", parseConfidence: 1, rawText: "1 cup or 2 handfuls spinach", ingredientId: "00000000-0000-4000-8000-000000000001" });
    // chosen, but no parse given: falls back to the parser's reading
    expect(reviewedDraft(imp.draft, { ...none, suggested: new Set([key]) }).sections[0].ingredients[2].name).toBe("or 2 handfuls spinach");
  });
});
