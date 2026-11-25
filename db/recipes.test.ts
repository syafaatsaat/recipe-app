import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyLine, type RecipeDraft } from "@/lib/recipes/schema";
import { createDb } from "./client";
import { addMyIngredient, searchIngredients } from "./ingredients";
import { listPans } from "./pans";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe } from "./recipes";
import { ingredients, recipeVersions } from "./schema";

const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, client } = createDb(URL);

const ALICE = "aaaaaaaa-2222-0000-0000-000000000000";
const BOB = "bbbbbbbb-2222-0000-0000-000000000000";

let flourId: string;
let eggId: string;

const line = (o: Partial<RecipeDraft["sections"][number]["ingredients"][number]>) => ({ ...emptyLine(), ...o });
const brownies = (): RecipeDraft => ({
  title: "Fudgy cocoa brownies",
  description: "Crackly top.",
  yieldQty: 12,
  yieldUnit: "squares",
  panId: null,
  prepMin: 15,
  cookMin: 25,
  ovenTempC: 176.7,
  sections: [
    {
      title: null,
      ingredients: [
        line({ quantity: 0.5, unitCode: "cup", ingredientId: flourId, name: "all-purpose flour" }),
        line({ quantity: 2, ingredientId: eggId, name: "large eggs" }),
        line({ quantity: 1, quantityMax: 2, unitCode: "tsp", name: "espresso powder", isOptional: true }),
        line({ name: "flaky salt", preparation: "for the top" }),
      ],
    },
  ],
  steps: [{ body: "Heat the oven." }, { body: "Mix and bake." }],
});

beforeAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`);
  await db.execute(sql`insert into auth.users (id, email) values (${ALICE}, 'a2@test.local'), (${BOB}, 'b2@test.local')`);
  const rows = await db.select().from(ingredients).where(sql`${ingredients.ownerId} is null and ${ingredients.name} in ('all-purpose flour', 'egg')`);
  flourId = rows.find((r) => r.name === "all-purpose flour")!.id;
  eggId = rows.find((r) => r.name === "egg")!.id;
});

afterAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`); // cascades
  await client.end();
});

describe("recipes", () => {
  let id: string;

  it("creates a recipe with version 1 and reads back the same draft", async () => {
    id = await createRecipe(db, ALICE, brownies());
    const r = await getRecipe(db, ALICE, id);
    expect(r).not.toBeNull();
    expect(r!.draft).toEqual(brownies());
    expect(r!.versionNo).toBe(1);
    expect(r!.versionCount).toBe(1);
    expect(r!.catalog[eggId]).toMatchObject({ name: "egg", isEgg: true, eachG: 50, defaultScalingRule: "count_round" });
    expect(r!.catalog[flourId]).toMatchObject({ densityGPerMl: 0.5072, mine: false });
  });

  it("update replaces the content and adds version 2 with the snapshot", async () => {
    const d = brownies();
    d.title = "Brownies, less sweet";
    d.sections = [
      { title: "Batter", ingredients: d.sections[0].ingredients.slice(0, 2) },
      { title: "Topping", ingredients: d.sections[0].ingredients.slice(3) },
    ];
    d.steps = [{ body: "One bowl." }];
    expect(await updateRecipe(db, ALICE, id, d, "less sugar")).toBe(2);

    const r = await getRecipe(db, ALICE, id);
    expect(r!.draft).toEqual(d);
    expect(r!.versionNo).toBe(2);
    expect(r!.versionCount).toBe(2);

    const versions = await db.select().from(recipeVersions).where(eq(recipeVersions.recipeId, id));
    const v2 = versions.find((v) => v.versionNo === 2)!;
    expect(v2.changeNote).toBe("less sugar");
    expect(v2.snapshot).toEqual({ schema: 1, draft: d });
    expect((versions.find((v) => v.versionNo === 1)!.snapshot as { draft: RecipeDraft }).draft.title).toBe("Fudgy cocoa brownies");
  });

  it("lists and searches the user's recipes", async () => {
    expect((await listRecipes(db, ALICE)).map((r) => r.id)).toContain(id);
    expect((await listRecipes(db, ALICE, "brownie")).map((r) => r.id)).toEqual([id]); // stemmed full-text
    expect((await listRecipes(db, ALICE, "less sw")).map((r) => r.id)).toEqual([id]); // partial words via ilike
    expect(await listRecipes(db, ALICE, "focaccia")).toEqual([]);
    expect(await listRecipes(db, ALICE, "100%_")).toEqual([]); // like wildcards are escaped
  });

  it("another user can't see, change or delete it", async () => {
    expect(await getRecipe(db, BOB, id)).toBeNull();
    expect(await listRecipes(db, BOB)).toEqual([]);
    expect(await updateRecipe(db, BOB, id, brownies())).toBeNull();
    expect(await deleteRecipe(db, BOB, id)).toBe(false);
    expect((await getRecipe(db, ALICE, id))!.draft.title).toBe("Brownies, less sweet");
  });

  it("rejects an invalid draft before touching the database", async () => {
    await expect(createRecipe(db, ALICE, { ...brownies(), title: " " })).rejects.toThrow();
  });

  it("deletes the recipe and its versions", async () => {
    expect(await deleteRecipe(db, ALICE, id)).toBe(true);
    expect(await getRecipe(db, ALICE, id)).toBeNull();
    expect(await db.select().from(recipeVersions).where(eq(recipeVersions.recipeId, id))).toEqual([]);
  });
});

describe("ingredients", () => {
  it("adds my own ingredient with grams per cup stored as density", async () => {
    const espresso = await addMyIngredient(db, ALICE, { name: " Espresso Powder ", gramsPerCup: 85 });
    expect(espresso).toMatchObject({ name: "espresso powder", mine: true, densityGPerMl: 0.3593 });
    // adding it again returns the same row
    expect((await addMyIngredient(db, ALICE, { name: "espresso powder", gramsPerCup: null })).id).toBe(espresso.id);
    const noDensity = await addMyIngredient(db, ALICE, { name: "mystery spice", gramsPerCup: null });
    expect(noDensity.densityGPerMl).toBeNull();
  });

  it("rejects out-of-range grams per cup", async () => {
    await expect(addMyIngredient(db, ALICE, { name: "x", gramsPerCup: 0 })).rejects.toThrow();
  });

  it("search finds catalog rows by name and alias, and only my own private rows", async () => {
    expect((await searchIngredients(db, ALICE, "flour"))[0].name).toBe("all-purpose flour");
    expect((await searchIngredients(db, ALICE, "bicarb")).map((i) => i.name)).toContain("baking soda");
    expect((await searchIngredients(db, ALICE, "espresso")).map((i) => i.name)).toEqual(["espresso powder"]);
    expect(await searchIngredients(db, BOB, "espresso")).toEqual([]);
    expect(await searchIngredients(db, ALICE, "  ")).toEqual([]);
  });

  it("another user can't link my private ingredient to their recipe", async () => {
    const [mine] = await searchIngredients(db, ALICE, "espresso");
    const d = brownies();
    d.sections[0].ingredients = [line({ quantity: 1, unitCode: "tsp", ingredientId: mine.id, name: "espresso" })];
    await expect(createRecipe(db, BOB, d)).rejects.toThrow();
  });
});

describe("pans", () => {
  it("lists the presets", async () => {
    const all = await listPans(db, ALICE);
    expect(all.find((p) => p.label === "9 in round")).toMatchObject({ shape: "round", diameterCm: 22.86, mine: false });
  });
});
