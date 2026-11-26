import { expect, test } from "@playwright/test";
import { latestEmailText, PASSWORD, signOut, signUp, uniqueEmail } from "./helpers";

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

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That email and password don’t match." })).toBeVisible();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
});

test("sign-up rejects a short password", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(uniqueEmail("short"));
  await page.getByLabel("Password").evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Use at least 8 characters." })).toBeVisible();
});

test("forgot password: the emailed link lets you set a new one", async ({ page }) => {
  const email = uniqueEmail("reset");
  await signUp(page, email);
  await signOut(page);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link is on its way");

  const text = await latestEmailText(email);
  const link = /https?:\/\/[^\s"<>)]+/.exec(text.replace(/&amp;/g, "&"))?.[0];
  expect(link, text).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/reset-password$/);

  await page.getByLabel("New password").fill("a brand new password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/recipes$/);

  await signOut(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a brand new password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
});
