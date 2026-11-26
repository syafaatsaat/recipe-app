import { expect, test } from "@playwright/test";
import { signOut, signUp, uniqueEmail } from "./helpers";

test("write a recipe, see it rendered, edit it to version 2, delete it", async ({ page }) => {
  await signUp(page, uniqueEmail("crud"));

  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: /Write from scratch/ }).click();
  await expect(page).toHaveURL(/\/recipes\/new$/);

  await page.getByLabel("Title").filter({ visible: true }).fill("Test brownies");
  await page.getByLabel("Makes", { exact: true }).filter({ visible: true }).fill("12");
  await page.getByLabel("What it makes").filter({ visible: true }).fill("squares");
  await page.getByLabel("Pan").filter({ visible: true }).selectOption({ label: "9 in round" });
  await page.getByLabel("Oven", { exact: true }).filter({ visible: true }).fill("350");

  const amounts = page.getByLabel("Amount").filter({ visible: true });
  const units = page.getByLabel("Unit", { exact: true }).filter({ visible: true });
  const names = page.getByLabel("Ingredient", { exact: true }).filter({ visible: true });

  // 1: catalog alias, linked automatically when the field loses focus
  await amounts.nth(0).fill("½");
  await units.nth(0).selectOption("cup");
  await names.nth(0).fill("flour");
  await names.nth(0).blur();
  await expect(page.getByRole("button", { name: "Matched to all-purpose flour. Change" })).toBeVisible();

  // 2: a range with an ingredient the catalog doesn't know, added as my own
  await amounts.nth(1).fill("1-2");
  await units.nth(1).selectOption("tsp");
  await names.nth(1).fill("espresso powder");
  await names.nth(1).blur();
  await page.getByRole("button", { name: "espresso powder is not matched. Pick one" }).click();
  await page.getByRole("option", { name: /Add “espresso powder” to my ingredients/ }).click();
  await page.getByLabel("Weight of 1 cup, in grams (optional)").filter({ visible: true }).fill("85");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Matched to espresso powder. Change" })).toBeVisible();

  // 3: no amount → "to taste"
  await names.nth(2).fill("flaky salt");
  await page.getByLabel("Step 1", { exact: true }).filter({ visible: true }).fill("Mix everything and bake until just set.");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Test brownies" })).toBeVisible();
  await expect(page.getByText("Makes 12 squares · 9 in round")).toBeVisible();
  await expect(page.getByText("½ cup", { exact: true })).toBeVisible();
  await expect(page.getByText("1–2 tsp", { exact: true })).toBeVisible();
  await expect(page.getByText("to taste", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Version 1 · updated/)).toBeVisible();

  // edit → version 2
  await page.getByRole("button", { name: "Recipe options" }).click();
  await page.getByRole("menuitem", { name: "Edit recipe" }).click();
  await expect(page.getByText("Saving makes version 2. Version 1 stays in history.")).toBeVisible();
  await page.getByLabel("Title").filter({ visible: true }).fill("Test brownies, less sweet");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Test brownies, less sweet" })).toBeVisible();
  await expect(page.getByText(/^Version 2 · updated/)).toBeVisible();

  // list and search
  await page.goto("/recipes?q=sweet");
  await expect(page.getByRole("link", { name: /Test brownies, less sweet/ })).toBeVisible();
  await page.goto("/recipes?q=focaccia");
  await expect(page.getByText("No recipes match “focaccia”.")).toBeVisible();

  // delete
  await page.goto("/recipes");
  await page.getByRole("link", { name: /Test brownies, less sweet/ }).click();
  await page.getByRole("button", { name: "Recipe options" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByRole("heading", { name: "No recipes yet" })).toBeVisible();
});

test("the editor shows what's wrong instead of saving", async ({ page }) => {
  await signUp(page, uniqueEmail("invalid"));
  await page.goto("/recipes/new");
  await page.getByLabel("Amount").filter({ visible: true }).first().fill("lots");
  await page.getByLabel("Ingredient", { exact: true }).filter({ visible: true }).first().fill("sugar");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Some fields need fixing." })).toBeVisible();
  await expect(page.getByText("Give the recipe a title.")).toBeVisible();
  await expect(page.getByText(/Use a number like 2, 1½/)).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new$/);
});

test("another account can't open my recipe", async ({ page }) => {
  await signUp(page, uniqueEmail("owner"));
  await page.goto("/recipes/new");
  await page.getByLabel("Title").filter({ visible: true }).fill("Private recipe");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  const url = page.url();

  await signOut(page);
  await signUp(page, uniqueEmail("intruder"));
  await page.goto(url);
  await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
  await expect(page.getByText("Private recipe")).toHaveCount(0);
});
