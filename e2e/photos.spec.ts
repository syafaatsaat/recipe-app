import { expect, test, type Page } from "@playwright/test";
import { signUp, uniqueEmail } from "./helpers";
import { photoCounts } from "./seed";

// Photos (doc §6 step 6, §3.12): resized in the browser, uploaded to the private
// bucket, signed when shown. The test photo is drawn at test time: no binary fixture.
const AFTER_SAVE = { timeout: 45_000 };
test.describe.configure({ timeout: 120_000 });

/** A 3000×2000 JPEG drawn in the page. */
async function bigPhoto(page: Page, colour = "#c0623a") {
  const base64 = await page.evaluate(async (fill) => {
    const c = document.createElement("canvas");
    c.width = 3000;
    c.height = 2000;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 3000, 2000);
    ctx.fillStyle = "#fff";
    ctx.fillRect(200, 200, 800, 400);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }, colour);
  return { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}

/** The real pixel width of the file an <img> shows (naturalWidth is density-corrected with srcset). */
const fileWidth = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate(async (img: HTMLImageElement) => {
    if (!img.complete || !img.currentSrc) return 0;
    const bitmap = await createImageBitmap(await (await fetch(img.currentSrc)).blob());
    return bitmap.width;
  });

async function newRecipe(page: Page, title: string, steps: string[]) {
  await page.goto("/recipes/new");
  await page.getByLabel("Title").filter({ visible: true }).fill(title);
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel(`Step ${i + 1}`, { exact: true }).filter({ visible: true }).fill(steps[i]);
  }
}

test("a cover photo is resized, stored privately, shown on the recipe and in the list, then removed", async ({ page }) => {
  const email = uniqueEmail("photo-cover");
  await signUp(page, email);
  await newRecipe(page, "Photo cake", ["Mix.", "Bake."]);

  const cover = page.getByRole("region", { name: "Cover photo" }).filter({ visible: true });
  await cover.locator('input[type="file"]').setInputFiles(await bigPhoto(page));
  await expect(cover.getByRole("button", { name: "Replace the cover photo" })).toBeVisible(AFTER_SAVE);
  await cover.getByLabel(/Describe the photo/).fill("A golden cake");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SAVE);
  const hero = page.getByRole("img", { name: "A golden cake" });
  await expect(hero).toBeVisible();
  // the stored photo is 1600 px on its long edge, served by a signed URL
  await expect(hero).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/photos\/.+\/full\?token=/);
  // a phone screen at 3× picks the full size
  await expect.poll(() => fileWidth(page, 'img[alt="A golden cake"]')).toBe(1600);
  expect(await photoCounts(email)).toEqual({ rows: 1, files: 2 });

  await page.goto("/recipes");
  const thumb = page.getByRole("link", { name: /Photo cake/ }).locator("img");
  await expect(thumb).toHaveAttribute("src", /\/thumb\?token=/);
  await expect.poll(() => fileWidth(page, 'a img')).toBe(400);

  // removing the cover deletes the row and both files
  await page.getByRole("link", { name: /Photo cake/ }).click();
  await page.getByRole("button", { name: "Recipe options" }).click();
  await page.getByRole("menuitem", { name: "Edit recipe" }).click();
  await page.getByRole("region", { name: "Cover photo" }).filter({ visible: true }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SAVE);
  await expect(page.getByRole("img", { name: "A golden cake" })).toHaveCount(0);
  await expect.poll(() => photoCounts(email)).toEqual({ rows: 0, files: 0 });
});

test("a step photo stays with its step when the steps are reordered", async ({ page }) => {
  await signUp(page, uniqueEmail("photo-step"));
  await newRecipe(page, "Step photo bread", ["Knead the dough.", "Shape the loaf."]);
  const add = page.getByRole("button", { name: "Add a photo to step 2" });
  await add.locator("xpath=..").locator('input[type="file"]').setInputFiles(await bigPhoto(page, "#6b8e4e"));
  await expect(page.getByRole("button", { name: "Remove the photo from step 2" })).toBeVisible(AFTER_SAVE);

  await page.getByRole("button", { name: "Step 2 options" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(page.getByRole("button", { name: "Remove the photo from step 1" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SAVE);
  const steps = page.getByRole("listitem").filter({ hasText: /Shape the loaf|Knead the dough/ });
  await expect(steps.first()).toContainText("Shape the loaf.");
  await expect(steps.first().getByRole("img", { name: "Step 1" })).toBeVisible();
  await expect(steps.nth(1).getByRole("img")).toHaveCount(0);
});

test("an imported recipe shows the source's photo, linked; a broken one shows the placeholder", async ({ page }) => {
  await signUp(page, uniqueEmail("photo-import"));
  for (const [path, title] of [["lemon-cake", "Lemon olive oil cake"], ["shortbread", "Brown butter shortbread"]] as const) {
    await page.goto("/recipes/import");
    await page.getByLabel("Recipe link").filter({ visible: true }).fill(`http://127.0.0.1:4010/${path}`);
    await page.getByRole("button", { name: "Read recipe" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible(AFTER_SAVE);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, AFTER_SAVE);
  }
  // the shortbread's photo link is broken: the placeholder shows instead
  await expect(page.locator("article [data-photo=placeholder]").first()).toBeVisible();

  await page.goto("/recipes");
  await page.getByRole("link", { name: /Lemon olive oil cake/ }).click();
  const hero = page.getByRole("img", { name: "Lemon olive oil cake" });
  await expect(hero).toHaveAttribute("src", "http://127.0.0.1:4010/cake-photo");
  await expect(hero).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(800);
});
