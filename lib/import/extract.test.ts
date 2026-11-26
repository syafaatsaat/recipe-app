import { describe, expect, it } from "vitest";
import { recipeDraftSchema } from "@/lib/recipes/schema";
import { ovenTempFromSteps, parseYield, toImportDraft } from "./draft";
import { extractRecipe, isoMinutes, plainText, withSections } from "./extract";
import { JSONLD_GRAPH, JSONLD_SIMPLE, MICRODATA, NO_RECIPE, PASTE_BLOG_CARD, PASTE_FULL_CARD, PASTE_NO_HEADINGS, PASTE_WITH_HEADINGS } from "./fixtures";
import { durationMinutes, parsePaste } from "./paste";

describe("extractRecipe: JSON-LD", () => {
  const r = extractRecipe(JSONLD_GRAPH, "https://www.example.com/cake?utm=x")!;

  it("finds the Recipe inside @graph, past a broken block, with @type as an array", () => {
    expect(r.method).toBe("jsonld");
    expect(r.title).toBe("Lemon olive oil cake");
    expect(r.description).toBe("A plain & sunny cake.");
  });

  it("reads ingredients, flattened steps, yield, times and image", () => {
    expect(r.ingredients).toHaveLength(7);
    expect(r.ingredients[0]).toEqual({ section: null, text: "1¾ cups (210g) all-purpose flour" });
    expect(r.steps).toEqual([
      "Heat the oven to 350°F. Oil a 9-inch round pan.",
      "Whisk the sugar, eggs and zest until pale.",
      "Fold in the flour, then the oil and butter.",
      "Bake 45 minutes, until a skewer comes out clean.",
    ]);
    expect(r.yieldText).toBe("8 slices");
    expect(r).toMatchObject({ prepMin: 15, cookMin: 45, imageUrl: "https://example.com/cake.jpg" });
  });

  it("credits the site and keeps the canonical URL", () => {
    expect(r.siteName).toBe("Example Kitchen");
    expect(r.url).toBe("https://example.com/lemon-olive-oil-cake");
  });

  it("handles a top-level array, string steps, a number yield and section lines", () => {
    const d = extractRecipe(JSONLD_SIMPLE, "https://www.example.org/dal")!;
    expect(d.siteName).toBe("example.org");
    expect(d.url).toBe("https://www.example.org/dal");
    expect(d.yieldText).toBe("4");
    expect(d.imageUrl).toBe("https://example.org/dal.jpg");
    expect(d.steps).toHaveLength(3);
    expect(d.ingredients.map((i) => i.section)).toEqual([null, "For the tadka", "For the tadka", "For the tadka"]);
  });
});

describe("extractRecipe: microdata and no recipe", () => {
  it("falls back to microdata", () => {
    const r = extractRecipe(MICRODATA, "https://example.net/shortbread")!;
    expect(r).toMatchObject({
      method: "microdata",
      title: "Brown butter shortbread",
      yieldText: "16 pieces",
      prepMin: 20,
      cookMin: 25,
      imageUrl: "https://example.net/shortbread.jpg",
    });
    expect(r.ingredients.map((i) => i.text)).toEqual(["1 cup (2 sticks) butter", "½ cup powdered sugar", "2 cups flour"]);
    expect(r.steps).toEqual(["Brown the butter and cool it.", "Mix everything and bake at 160 °C for 25 minutes."]);
  });

  it("returns null when the page has no recipe", () => {
    expect(extractRecipe(NO_RECIPE, "https://example.com/about")).toBeNull();
    expect(extractRecipe("<html></html>", null)).toBeNull();
  });

  it("ignores a canonical link that isn't http(s)", () => {
    const html = `<link rel="canonical" href="javascript:alert(1)">${MICRODATA}`;
    expect(extractRecipe(html, "https://example.net/s")!.url).toBe("https://example.net/s");
  });
});

describe("helpers", () => {
  it("reads ISO 8601 durations", () => {
    expect(isoMinutes("PT1H30M")).toBe(90);
    expect(isoMinutes("P0DT0H20M")).toBe(20);
    expect(isoMinutes("PT90S")).toBe(2);
    expect(isoMinutes("P1D")).toBe(1440);
    expect(isoMinutes("PT")).toBeNull();
    expect(isoMinutes("20 minutes")).toBeNull();
    expect(isoMinutes(20)).toBeNull();
    expect(isoMinutes("PT0M")).toBeNull();
  });

  it("decodes text", () => {
    expect(plainText("Fish &amp; chips <em>now</em>")).toBe("Fish & chips now");
    expect(plainText(42)).toBe("42");
    expect(plainText(null)).toBe("");
  });

  it("turns heading lines into sections", () => {
    expect(withSections(["Cake:", "1 cup flour", "For the frosting", "1 cup sugar", ""])).toEqual([
      { section: "Cake", text: "1 cup flour" },
      { section: "For the frosting", text: "1 cup sugar" },
    ]);
  });

  it("reads yields", () => {
    expect(parseYield("8 slices")).toEqual({ qty: 8, unit: "slices" });
    expect(parseYield("Serves 4")).toEqual({ qty: 4, unit: "servings" });
    expect(parseYield("4-6 servings")).toEqual({ qty: 4, unit: "servings" });
    expect(parseYield("Makes 2 dozen cookies")).toEqual({ qty: 2, unit: "dozen cookies" });
    expect(parseYield("1 loaf (9x5)")).toEqual({ qty: 1, unit: "loaf" });
    expect(parseYield("12")).toEqual({ qty: 12, unit: null });
    expect(parseYield("½ batch")).toEqual({ qty: 0.5, unit: "batch" });
    expect(parseYield("a few")).toEqual({ qty: null, unit: null });
    expect(parseYield(null)).toEqual({ qty: null, unit: null });
  });

  it("finds the oven temperature in the method", () => {
    expect(ovenTempFromSteps(["Mix.", "Bake at 350°F for 30 min."])).toBe(176.7);
    expect(ovenTempFromSteps(["Heat the oven to 180 °C."])).toBe(180);
    expect(ovenTempFromSteps(["Heat the oven to 425 degrees."])).toBe(218.3);
    expect(ovenTempFromSteps(["Preheat to 200C (fan 180C)."])).toBe(200);
    expect(ovenTempFromSteps(["Simmer for 100 minutes."])).toBeNull();
    expect(ovenTempFromSteps(["Heat to 900°F."])).toBeNull();
  });
});

describe("parsePaste", () => {
  it("follows the headings, sections, yield and step numbers", () => {
    const r = parsePaste(PASTE_WITH_HEADINGS);
    expect(r).toMatchObject({ method: "paste", title: "Lemon drizzle loaf", yieldText: "Serves 8", url: null });
    expect(r.ingredients.map((i) => [i.section, i.text])).toEqual([
      [null, "225g self-raising flour"],
      [null, "225g caster sugar"],
      [null, "4 eggs"],
      ["For the drizzle", "juice of 1½ lemons"],
      ["For the drizzle", "85g caster sugar"],
    ]);
    expect(r.steps).toEqual([
      "Heat the oven to 180°C.",
      "Beat everything together and spoon into a 9x5 loaf tin.",
      "Bake for 45 minutes.",
      "Mix the juice and sugar, and pour over the warm cake.",
    ]);
  });

  it("sorts lines without headings into ingredients and steps", () => {
    const r = parsePaste(PASTE_NO_HEADINGS);
    expect(r.title).toBe("Quick pancakes");
    expect(r.ingredients.map((i) => i.text)).toEqual(["1 cup flour", "1 tbsp sugar", "1 cup milk", "1 egg"]);
    expect(r.steps).toHaveLength(2);
  });

  it("reads yield and times from labels with the value on the next line", () => {
    const r = parsePaste(PASTE_BLOG_CARD);
    expect(r).toMatchObject({ title: "Lemon olive oil cake", yieldText: "Servings 8 slices", prepMin: 15, cookMin: 65 });
    expect(r.ingredients.map((i) => i.text)).toEqual(["1¾ cups all-purpose flour", "3 large eggs"]);
    expect(r.steps).toEqual(["Heat the oven to 350°F.", "Bake 45 minutes, until golden."]);
    expect(toImportDraft(r).draft).toMatchObject({ yieldQty: 8, yieldUnit: "slices", prepMin: 15, cookMin: 65 });
  });

  it("reads labels with the value on the same line, and leaves steps that only look like them", () => {
    const r = parsePaste(
      [
        "Pancakes",
        "Prep time: 10 minutes",
        "Cook 25 min",
        "Rest: 1 hour",
        "Serves: 4",
        "1 cup flour",
        "1 egg",
        "Cook the pancakes until golden.",
        "Rest the batter if you have time.",
        "Makes a great breakfast.",
      ].join("\n"),
    );
    expect(r).toMatchObject({ title: "Pancakes", yieldText: "Serves 4", prepMin: 10, cookMin: 25 });
    expect(r.ingredients.map((i) => i.text)).toEqual(["1 cup flour", "1 egg"]);
    expect(r.steps).toEqual(["Cook the pancakes until golden.", "Rest the batter if you have time.", "Makes a great breakfast."]);
  });

  it("keeps a line after a label when it isn't the label's value", () => {
    const r = parsePaste("Bread\nMakes\n1 loaf\nCook Time\nabout an hour\nPreparation:\nKnead well.");
    expect(r).toMatchObject({ yieldText: "Makes 1 loaf", cookMin: null, description: "about an hour", steps: ["Knead well."] });
  });

  it("leaves out card buttons, ratings, details, equipment and nutrition; notes go to the description", () => {
    const r = parsePaste(PASTE_FULL_CARD);
    expect(r).toMatchObject({
      title: "Brown butter cookies",
      description: "Chewy in the middle, crisp at the edge. The dough keeps 3 days in the fridge.",
      yieldText: "Servings 24 cookies",
      prepMin: 20,
      cookMin: 12,
    });
    expect(r.ingredients.map((i) => i.text)).toEqual(["1 cup unsalted butter", "2 cups all-purpose flour"]);
    expect(r.steps).toEqual(["Brown the butter and let it cool.", "Mix in the flour and bake 12 minutes."]);
  });

  it("keeps sentences that only start like a card detail", () => {
    const r = parsePaste("Soup\n1 onion\nCourse salt works too, if you have it.\nDiet: vegan\nAuthor notes are below.");
    expect(r.steps).toEqual(["Course salt works too, if you have it.", "Author notes are below."]);
    // a label alone drops its value, but not a heading that follows it
    expect(parsePaste("Soup\nCuisine\nIngredients\n1 onion").ingredients.map((i) => i.text)).toEqual(["1 onion"]);
  });

  it("reads durations", () => {
    expect(durationMinutes("15 mins")).toBe(15);
    expect(durationMinutes("1 hr 5 mins")).toBe(65);
    expect(durationMinutes("1 hour and 30 minutes")).toBe(90);
    expect(durationMinutes("1.5 hours")).toBe(90);
    expect(durationMinutes("2h")).toBe(120);
    expect(durationMinutes("0 min")).toBeNull();
    expect(durationMinutes("about an hour")).toBeNull();
    expect(durationMinutes("")).toBeNull();
  });

  it("copes with empty text", () => {
    expect(parsePaste("")).toMatchObject({ title: null, ingredients: [], steps: [] });
  });
});

describe("toImportDraft", () => {
  it("builds a valid draft with parse results alongside", () => {
    const { draft, parsed, source } = toImportDraft(extractRecipe(JSONLD_GRAPH, "https://example.com/cake")!);
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft).toMatchObject({ title: "Lemon olive oil cake", yieldQty: 8, yieldUnit: "slices", prepMin: 15, cookMin: 45, ovenTempC: 176.7 });
    const lines = draft.sections[0].ingredients;
    expect(lines[4]).toMatchObject({ quantity: 4, unitCode: "oz", name: "butter", rawText: "1 stick butter, softened", parseConfidence: 0.97 });
    expect(lines[6]).toMatchObject({ quantity: null, note: "pinch", name: "flaky salt" });
    expect(parsed[0].filter((p) => p.confidence < 0.8).map((p) => p.raw)).toEqual(["Zest of 2 lemons"]);
    expect(source).toEqual({ method: "jsonld", url: "https://example.com/lemon-olive-oil-cake", siteName: "Example Kitchen", imageUrl: "https://example.com/cake.jpg" });
  });

  it("titles every section once there is more than one", () => {
    const { draft } = toImportDraft(parsePaste(PASTE_WITH_HEADINGS));
    expect(draft.sections.map((s) => s.title)).toEqual(["Ingredients", "For the drizzle"]);
    expect(draft.ovenTempC).toBe(180);
    expect(draft).toMatchObject({ yieldQty: 8, yieldUnit: "servings" });
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("names untitled sections after the first", () => {
    const { draft } = toImportDraft({
      ...parsePaste(""),
      ingredients: [{ section: "Cake", text: "1 cup flour" }, { section: null, text: "1 egg" }],
    });
    expect(draft.sections.map((s) => s.title)).toEqual(["Cake", "Part 2"]);
  });

  it("gives an untitled, empty paste a title and one empty section", () => {
    const { draft } = toImportDraft(parsePaste(""));
    expect(draft.title).toBe("Imported recipe");
    expect(draft.sections).toEqual([{ title: null, ingredients: [] }]);
    expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
  });
});

describe("extractRecipe: shapes seen in the wild", () => {
  const page = (ld: unknown, body = "") =>
    `<html><head><script type="application/ld+json"><!--${JSON.stringify(ld)}--></script></head><body>${body}</body></html>`;

  it("finds a Recipe under mainEntity, with old-style `ingredients` and <li> instructions", () => {
    const r = extractRecipe(
      page({
        "@type": "WebPage",
        mainEntity: {
          "@type": "Recipe",
          name: "Toast",
          ingredients: ["2 slices bread", { text: "butter" }],
          recipeInstructions: "<ol><li>Toast the bread.</li><li>Butter it.</li></ol>",
          image: { "@id": "https://example.com/toast.jpg" },
          recipeYield: [2, "2 servings"],
        },
      }),
      "https://example.com/toast",
    )!;
    expect(r.ingredients.map((i) => i.text)).toEqual(["2 slices bread"]);
    expect(r.steps).toEqual(["Toast the bread.", "Butter it."]);
    expect(r.imageUrl).toBe("https://example.com/toast.jpg");
    expect(r.yieldText).toBe("2 servings");
  });

  it("reads untyped lists, odd step values and string or nested images", () => {
    const r = extractRecipe(
      page({
        "@type": "Recipe",
        recipeIngredient: ["1 egg"],
        recipeInstructions: [{ itemListElement: [{ text: "Crack it." }, 7, null, { name: "" }] }, "Line one<br>Line two"],
        image: [[], "https://example.com/egg.jpg"],
      }),
      null,
    )!;
    expect(r.steps).toEqual(["Crack it.", "Line one", "Line two"]);
    expect(r.imageUrl).toBe("https://example.com/egg.jpg");
    expect(r.siteName).toBeNull();
    expect(r.url).toBeNull();
  });

  it("goes on to microdata when the JSON-LD recipe has no ingredients", () => {
    const html = `${page({ "@type": "Recipe", name: "Empty" })}${MICRODATA}`;
    expect(extractRecipe(html, "https://example.net/x")!.method).toBe("microdata");
  });

  it("stops descending into very deep JSON-LD", () => {
    let deep: unknown = { "@type": "Recipe", recipeIngredient: ["1 egg"] };
    for (let i = 0; i < 10; i++) deep = [deep];
    expect(extractRecipe(page(deep), null)).toBeNull();
  });

  it("reads microdata instructions without a list, and skips a scope without ingredients", () => {
    const html = `<div itemscope itemtype="http://schema.org/Recipe"><span itemprop="name">Tea</span>
      <span itemprop="recipeIngredient">1 tea bag</span>
      <div itemprop="recipeInstructions">Steep for 3 minutes.</div></div>`;
    expect(extractRecipe(html, null)).toMatchObject({ title: "Tea", steps: ["Steep for 3 minutes."], imageUrl: null, yieldText: null });
    expect(extractRecipe(`<div itemscope itemtype="https://schema.org/Recipe"><b itemprop="name">x</b></div>`, null)).toBeNull();
  });

  it("keeps the fetched URL when the canonical link is malformed", () => {
    const html = `<link rel="canonical" href="http://[bad">${MICRODATA}`;
    expect(extractRecipe(html, "https://example.net/s")!.url).toBe("https://example.net/s");
  });
});
