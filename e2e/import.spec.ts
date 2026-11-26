import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers";

// Import from a link or pasted text (doc §6 step 5), against the hand-written pages
// that e2e/fixture-server.mjs serves (allowed via IMPORT_ALLOW_HOSTS, never in production).
const SITE = "http://127.0.0.1:4010";
// This spec runs before the others, so on a cold .next the first submit also compiles
// the action, the review route and the recipe page: allow for that after each submit.
const AFTER_SUBMIT = { timeout: 45_000 };
test.describe.configure({ timeout: 120_000 });

const amountOf = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name }).locator("span").first();

async function importLink(page: Page, url: string) {
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: /Import from a link/ }).click();
  await expect(page).toHaveURL(/\/recipes\/import$/);
  await page.getByLabel("Recipe link").filter({ visible: true }).fill(url);
  await page.getByRole("button", { name: "Read recipe" }).click();
}

test("link import: review, one-tap fix, import with the credit; stick becomes 4 oz, 115 g in Metric", async ({ page }) => {
  await signUp(page, uniqueEmail("import-link"));
  await importLink(page, `${SITE}/lemon-cake`);

  await expect(page).toHaveURL(/\/recipes\/import\/[0-9a-f-]{36}$/, AFTER_SUBMIT);
  const reviewUrl = page.url();
  await expect(page.getByRole("heading", { name: "Lemon olive oil cake" })).toBeVisible();
  await expect(page.getByText("From Test Kitchen · 8 slices")).toBeVisible();
  await expect(page.getByText("1 to check")).toBeVisible();
  await expect(page.getByText("1 line still flagged. You can import now and fix them later.")).toBeVisible();

  // the stick is converted, with the original kept and a note
  const butter = page.getByRole("listitem").filter({ hasText: "1 stick unsalted butter, softened" });
  await expect(butter.getByText("1 stick = 4 oz")).toBeVisible();
  await expect(butter.getByText("unsalted butter ✓")).toBeVisible();

  const zest = page.getByRole("listitem").filter({ hasText: "Zest of 2 lemons" });
  await expect(zest.getByText("Check this one")).toBeVisible();
  await zest.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByText("All checked")).toBeVisible();
  await expect(zest.getByText("Check this one")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Method · 4 steps" })).toBeVisible();
  await page.getByRole("button", { name: "Looks fine. Show" }).click();
  await expect(page.getByText("Fold in the flour, then the oil and butter.")).toBeVisible();

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SUBMIT);
  await expect(page.getByRole("heading", { name: "Lemon olive oil cake" })).toBeVisible();
  await expect(page.getByRole("link", { name: "From Test Kitchen ↗" })).toHaveAttribute("href", `${SITE}/lemon-cake`);
  await expect(amountOf(page, "unsalted butter")).toHaveText("4 oz");
  await expect(page.getByText(/Oven 350 °F/)).toBeVisible();
  await page.getByRole("button", { name: "Metric" }).click();
  await expect(amountOf(page, "unsalted butter")).toHaveText("115 g");

  // the review page of an imported job goes to the recipe, not a second copy
  const recipeUrl = page.url().replace(/\?.*$/, "");
  await page.goto(reviewUrl);
  await expect(page).toHaveURL(recipeUrl);
});

test("a flagged line imported as is shows its original text in the editor until it's edited", async ({ page }) => {
  await signUp(page, uniqueEmail("import-later"));
  await importLink(page, `${SITE}/lemon-cake`);
  await expect(page.getByText("1 to check")).toBeVisible(AFTER_SUBMIT);
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SUBMIT);

  await page.goto(`${page.url()}/edit`);
  const hint = page.getByText("Check it, then edit or keep it.").filter({ visible: true });
  await expect(hint).toHaveCount(1);
  await expect(hint).toContainText("Zest of 2 lemons");
  const prep = page.locator('input[aria-label="Preparation"][value="zested"]').filter({ visible: true });
  await prep.fill("finely zested");
  await expect(hint).toHaveCount(0);
});

test("microdata page: sticks of butter become ounces", async ({ page }) => {
  await signUp(page, uniqueEmail("import-micro"));
  await importLink(page, `${SITE}/shortbread`);
  await expect(page.getByRole("heading", { name: "Brown butter shortbread" })).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByText("A stick = 4 oz")).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SUBMIT);
  await expect(amountOf(page, "butter")).toHaveText("8 oz");
});

test("a page with no recipe offers paste, which keeps the link as the credit", async ({ page }) => {
  await signUp(page, uniqueEmail("import-fallback"));
  await importLink(page, `${SITE}/about`);
  await expect(page.getByText("Couldn’t read a recipe from that page.")).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByText("Failed")).toBeVisible();

  await page.getByLabel("Paste the text instead").filter({ visible: true }).fill(
    "Quick pancakes\n1 cup flour\n1 tbsp sugar\n1 cup milk\n1 egg\nWhisk everything until smooth.\nCook on a hot pan, then flip.",
  );
  await page.getByRole("button", { name: "Read pasted text" }).click();
  await expect(page.getByRole("heading", { name: "Quick pancakes" })).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByText("Pasted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SUBMIT);
  await expect(page.getByRole("link", { name: "From 127.0.0.1 ↗" })).toHaveAttribute("href", `${SITE}/about`);
});

test("paste from the New menu keeps sections", async ({ page }) => {
  await signUp(page, uniqueEmail("import-paste"));
  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: /Paste recipe text/ }).click();
  await expect(page).toHaveURL(/\/recipes\/import\?paste=1$/);
  await page.getByLabel("Recipe text").filter({ visible: true }).fill(
    [
      "Lemon drizzle loaf",
      "A tender loaf with a sharp glaze.",
      "Print Recipe",
      "4.9 from 30 votes",
      "Course Dessert",
      "Cuisine",
      "British",
      "Prep Time",
      "15 mins",
      "Cook Time",
      "45 mins",
      "Servings",
      "8",
      "",
      "Ingredients",
      "225g self-raising flour",
      "225g caster sugar",
      "4 eggs",
      "For the drizzle:",
      "85g caster sugar",
      "",
      "Method",
      "1. Heat the oven to 180°C.",
      "2. Beat everything together and spoon into a loaf tin.",
      "3. Mix the lemon juice and sugar, and pour over the warm cake.",
      "Nutrition",
      "Calories: 250kcal",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Read pasted text" }).click();
  await expect(page.getByRole("heading", { name: "Lemon drizzle loaf" })).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByText("From pasted text · 8 servings")).toBeVisible();
  await expect(page.getByRole("heading", { name: "For the drizzle" })).toBeVisible();
  // the labels and their values are read as yield and times, not as ingredients or steps
  await expect(page.getByRole("listitem").filter({ hasText: /mins|Time|Servings|Course|British|votes|Calories|Print/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Method · 3 steps" })).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SUBMIT);
  await expect(page.getByRole("heading", { name: "For the drizzle" })).toBeVisible();
  await expect(page.getByText(/From .* ↗/)).toHaveCount(0);
  await expect(page.getByText("Prep 15 min · Cook 45 min · Oven 180 °C")).toBeVisible();
  await expect(page.getByText("A tender loaf with a sharp glaze.")).toBeVisible();
});

test("private addresses are refused with a friendly error", async ({ page }) => {
  await signUp(page, uniqueEmail("import-ssrf"));
  await page.goto("/recipes/import");
  for (const url of ["http://127.0.0.1:54321/rest/v1/", "http://localhost:3000/recipes", "file:///etc/passwd"]) {
    await page.getByLabel("Recipe link").filter({ visible: true }).fill(url);
    await page.getByRole("button", { name: "Read recipe" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(/That address can’t be imported\.|That doesn’t look like a web address/, AFTER_SUBMIT);
    await expect(page).toHaveURL(/\/recipes\/import$/);
  }
});
