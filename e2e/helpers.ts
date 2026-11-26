import { expect, type Page } from "@playwright/test";

export const PASSWORD = "correct horse battery";
export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto("/signup");
  await page.getByLabel("Email").filter({ visible: true }).fill(email);
  await page.getByLabel("Password").filter({ visible: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const MAILPIT = "http://127.0.0.1:54324";

/** The newest email Mailpit caught for this address, as plain text. */
export async function latestEmailText(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string; HTML: string };
      return msg.Text || msg.HTML;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email for ${to}`);
}

/**
 * Next 16 keeps recently visited pages mounted but hidden (React Activity). So:
 * ids must come from useId() (a fixed id="email" on two pages points the visible
 * label at the hidden field), and field lookups use .filter({ visible: true }),
 * because getByLabel also matches the hidden page's fields.
 */
export async function expectUniqueIds(page: Page) {
  const ids = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((e) => e.id));
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
}
