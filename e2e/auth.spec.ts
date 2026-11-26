import { expect, test } from "@playwright/test";
import { expectUniqueIds, latestEmailText, PASSWORD, signOut, signUp, uniqueEmail } from "./helpers";

test("signed-out visitors are sent to sign in, then back where they were going", async ({ page }) => {
  await page.goto("/recipes/new");
  await expect(page).toHaveURL(/\/login\?next=%2Frecipes%2Fnew$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("sign up, sign out, sign in with a wrong and then the right password", async ({ page }) => {
  const email = uniqueEmail("auth");
  await signUp(page, email);
  await expect(page.getByRole("heading", { name: "No recipes yet" })).toBeVisible();
  await signOut(page);
  // /signup is still mounted (hidden) here; its fields must not share ids with /login's
  await expectUniqueIds(page);

  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That email and password don’t match." })).toBeVisible();

  await page.getByLabel("Password").filter({ visible: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
});

test("sign-up rejects a short password", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").filter({ visible: true }).fill(uniqueEmail("short"));
  await page.getByLabel("Password").filter({ visible: true }).evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
  await page.getByLabel("Password").filter({ visible: true }).fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Use at least 8 characters." })).toBeVisible();
});

test("forgot password: the emailed link lets you set a new one", async ({ page }) => {
  const email = uniqueEmail("reset");
  await signUp(page, email);
  await signOut(page);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link is on its way");

  const text = await latestEmailText(email);
  const link = /https?:\/\/[^\s"<>)]+/.exec(text.replace(/&amp;/g, "&"))?.[0];
  expect(link, text).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/reset-password$/);

  await page.getByLabel("New password").filter({ visible: true }).fill("a brand new password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/recipes$/);

  await signOut(page);
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill("a brand new password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
});

test("an action after the session ends goes to sign in, not a broken response", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signUp(page, uniqueEmail("expired"));
  await page.goto("/recipes/new");
  await page.context().clearCookies(); // e.g. signed out in another tab, or `pnpm db:reset`
  const ingredient = page.getByLabel("Ingredient", { exact: true }).filter({ visible: true }).first();
  await ingredient.fill("flour");
  await ingredient.blur(); // runs the exactIngredient Server Action
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
