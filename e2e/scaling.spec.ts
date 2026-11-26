import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signUp, uniqueEmail } from "./helpers";
import { seedBrownies } from "./seed";

// The recipe view's scale and unit controls (doc §6 step 4), on the canvas brownies:
// 10 tbsp butter, 1¼ cups sugar, 2 eggs, ½ tsp baking powder; 12 squares, 9 in round.

const amountOf = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name }).locator("span").first();

async function openBrownies(page: Page, tag: string) {
  const email = uniqueEmail(tag);
  await signUp(page, email);
  const id = await seedBrownies(email);
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole("heading", { name: "Fudgy cocoa brownies" })).toBeVisible();
  return { email, id };
}

test("chips scale amounts and write the URL; units toggle; reset returns the original", async ({ page }) => {
  await openBrownies(page, "chips");
  await expect(amountOf(page, "granulated sugar")).toHaveText("1¼ cups");
  await expect(page.getByRole("button", { name: "Reset to original" })).toHaveCount(0);

  await page.getByRole("button", { name: "2×" }).click();
  await expect(page).toHaveURL(/\?mode=factor&f=2$/);
  await expect(page.getByLabel("Scale factor").filter({ visible: true })).toHaveText("×2");
  await expect(amountOf(page, "granulated sugar")).toHaveText("2½ cups");
  await expect(page.getByText("orig. 1¼ cups")).toBeVisible();
  await expect(page.getByText("Makes 24 squares")).toBeVisible();

  // survives a reload
  await page.reload();
  await expect(amountOf(page, "granulated sugar")).toHaveText("2½ cups");
  await expect(page.getByRole("button", { name: "2×" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Metric" }).click();
  await expect(page).toHaveURL(/\?mode=factor&f=2&units=metric$/);
  await expect(amountOf(page, "granulated sugar")).toHaveText("495 g");
  await expect(page.getByText(/Oven 350 °F \(175 °C\)/)).toBeVisible();

  await page.getByRole("button", { name: "Reset to original" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(amountOf(page, "granulated sugar")).toHaveText("1¼ cups");
  await expect(page.getByText(/^orig\./)).toHaveCount(0);
  await expect(page.getByText(/Oven 350 °F/)).toBeVisible();
});

test("3× warns about baking powder", async ({ page }) => {
  await openBrownies(page, "leaven");
  await page.getByRole("button", { name: "3×" }).click();
  await expect(page.getByRole("note").filter({ hasText: "Baking powder doesn’t always scale past 2×" })).toBeVisible();
  await expect(page.getByText("May not rise the same at this size")).toBeVisible();
  await page.getByRole("button", { name: "2×" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("the sheet scales by factor, yield and pan", async ({ page }) => {
  await openBrownies(page, "sheet");

  // factor: out of range, then 1½
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("tab", { name: "Factor" }).click();
  await page.getByLabel("Multiply by").filter({ visible: true }).fill("25");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Use a number between 0.1 and 20.")).toBeVisible();
  await page.getByLabel("Multiply by").filter({ visible: true }).fill("1½");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\?mode=factor&f=1.5$/);
  await expect(page.getByLabel("Scale factor").filter({ visible: true })).toHaveText("×1.5");
  await expect(page.getByRole("button", { name: "More" })).toHaveAttribute("aria-pressed", "true");

  // yield: 18 squares is 1.5× too
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("tab", { name: "Yield" }).click();
  await expect(page.getByText("The recipe makes 12 squares.")).toBeVisible();
  await page.getByLabel("How many squares?").filter({ visible: true }).fill("6");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\?mode=yield&qty=6$/);
  await expect(page.getByText("Makes 6 squares")).toBeVisible();
  await expect(amountOf(page, "granulated sugar")).toHaveText("½ cup + 2 tbsp");

  // pan: 9 in round → 9×13; the muffin tin can't be converted
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("tab", { name: "Pan" }).click();
  await expect(page.getByRole("radio", { name: /12-cup muffin tin/ })).toBeDisabled();
  await page.getByRole("radio", { name: /9×13 in rectangle, 117 in² · ×1.84/ }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\?mode=pan&pan=[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Scale factor").filter({ visible: true })).toHaveText("×1.84");
  await expect(page.getByRole("button", { name: "9×13" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Makes about 22 squares")).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: "Round to rectangle changes the bake time." })).toBeVisible();
  await expect(amountOf(page, "unsalted butter")).toHaveText("1⅛ cups");

  // back to the original pan clears the scale
  await page.getByRole("button", { name: "9×13" }).click();
  await page.getByRole("radio", { name: /9 in round/ }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
});

test("copy link opens the same scaled view, after signing in elsewhere", async ({ page, browser }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const { email } = await openBrownies(page, "link");
  await page.getByRole("button", { name: "3×" }).click();
  await page.getByRole("button", { name: "Metric" }).click();
  await page.getByRole("button", { name: "Recipe options" }).click();
  await page.getByRole("menuitem", { name: "Copy link to this view" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\?mode=factor&f=3&units=metric$/);

  // another device: sign in, land on the same view, already scaled on the server
  const other = await browser.newContext({ baseURL: "http://localhost:3000" });
  const p2 = await other.newPage();
  await p2.goto(link);
  await expect(p2).toHaveURL(/\/login\?next=/);
  await p2.getByLabel("Email").filter({ visible: true }).fill(email);
  await p2.getByLabel("Password").filter({ visible: true }).fill(PASSWORD);
  await p2.getByRole("button", { name: "Sign in" }).click();
  await expect(p2).toHaveURL(link);
  await expect(amountOf(p2, "granulated sugar")).toHaveText("745 g");
  await expect(p2.getByLabel("Scale factor").filter({ visible: true })).toHaveText("×3");

  // no client JS needed for the first paint: the server rendered the scaled view
  const html = await (await p2.request.get(link)).text();
  expect(html).toContain("745 g");
  await other.close();
});

test("Back leaves the recipe instead of stepping through scale taps", async ({ page }) => {
  await openBrownies(page, "back");
  await page.getByRole("button", { name: "2×" }).click();
  await page.getByRole("button", { name: "3×" }).click();
  await page.getByRole("button", { name: "Metric" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/recipes$/);
});
