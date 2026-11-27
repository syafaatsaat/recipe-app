import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyDraft, emptyLine, type RecipeDraft } from "@/lib/recipes/schema";
import { createDb } from "./client";
import { PhotoNotUploadedError, recipePhotos } from "./photos";
import { createRecipe, getRecipe, listRecipes, updateRecipe } from "./recipes";

const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, client } = createDb(URL);

const ALICE = "aaaaaaaa-7777-0000-0000-000000000000";
const BOB = "bbbbbbbb-7777-0000-0000-000000000000";
const P1 = "11111111-7777-4000-8000-000000000001";
const P2 = "11111111-7777-4000-8000-000000000002";
const P3 = "11111111-7777-4000-8000-000000000003";
const ref = (id: string, alt: string | null = null) => ({ id, width: 1600, height: 1200, alt });

const cake = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({
  ...emptyDraft(),
  title: "Photo cake",
  sections: [{ title: null, ingredients: [{ ...emptyLine(), name: "flour", quantity: 1, unitCode: "cup" }] }],
  steps: [{ body: "Mix.", photoId: null }, { body: "Bake.", photoId: null }, { body: "Cool.", photoId: null }],
  ...over,
});

beforeAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`);
  await db.execute(sql`insert into auth.users (id, email) values (${ALICE}, 'a7@test.local'), (${BOB}, 'b7@test.local')`);
});

afterAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`);
  await client.end();
});

describe("recipe photos", () => {
  it("a new recipe stores its checked uploads, cover and step photo, in the owner's folder", async () => {
    const draft = cake({
      photos: [ref(P1, "The cake"), ref(P2)],
      coverPhotoId: P1,
      steps: [{ body: "Mix.", photoId: null }, { body: "Bake.", photoId: P2 }, { body: "Cool.", photoId: null }],
    });
    const id = await createRecipe(db, ALICE, draft, undefined, { uploads: new Set([P1, P2]) });
    const r = (await getRecipe(db, ALICE, id))!;
    expect(r.draft).toMatchObject({ coverPhotoId: P1, photos: [ref(P1, "The cake"), ref(P2)] });
    expect(r.draft.steps.map((s) => s.photoId)).toEqual([null, P2, null]);
    expect(r.photos[0]).toMatchObject({ origin: "upload", storagePath: `${ALICE}/${P1}/full`, thumbPath: `${ALICE}/${P1}/thumb`, isCover: true });
    expect((await listRecipes(db, ALICE)).find((x) => x.id === id)!.cover).toEqual({ thumbPath: `${ALICE}/${P1}/thumb`, externalUrl: null });
    // other users see none of it
    expect(await recipePhotos(db, BOB, id)).toEqual([]);

    // re-saving re-creates the steps: the photo follows its step to the new position
    const moved = { ...r.draft, steps: [r.draft.steps[1], r.draft.steps[0], r.draft.steps[2]] };
    await updateRecipe(db, ALICE, id, moved);
    expect((await getRecipe(db, ALICE, id))!.draft.steps.map((s) => s.photoId)).toEqual([P2, null, null]);

    // dropping the cover deletes its row; a new step photo is added
    await updateRecipe(db, ALICE, id, {
      ...moved,
      coverPhotoId: null,
      photos: [ref(P2), ref(P3)],
      steps: [moved.steps[0], { ...moved.steps[1], photoId: P3 }, moved.steps[2]],
    }, null, { uploads: new Set([P3]) });
    const after = (await getRecipe(db, ALICE, id))!;
    expect(after.photos.map((p) => p.id).sort()).toEqual([P2, P3]);
    expect(after.draft.coverPhotoId).toBeNull();
    expect((await listRecipes(db, ALICE)).find((x) => x.id === id)!.cover).toBeNull();
  });

  it("refuses a photo that isn't a checked upload, and saves nothing", async () => {
    const before = (await listRecipes(db, BOB)).length;
    await expect(createRecipe(db, BOB, cake({ photos: [ref(P1)], coverPhotoId: P1 }))).rejects.toThrow(PhotoNotUploadedError);
    expect((await listRecipes(db, BOB)).length).toBe(before);
  });

  it("an imported photo is a link, not an upload", async () => {
    const id = await createRecipe(
      db,
      ALICE,
      cake({ photos: [{ id: P3.replace(/3$/, "4"), width: null, height: null, alt: null }], coverPhotoId: P3.replace(/3$/, "4") }),
      { sourceType: "import", sourceUrl: "https://example.com/cake" },
      { imported: { id: P3.replace(/3$/, "4"), url: "https://example.com/cake.jpg" } },
    );
    const r = (await getRecipe(db, ALICE, id))!;
    expect(r.photos).toEqual([expect.objectContaining({ origin: "import", externalUrl: "https://example.com/cake.jpg", storagePath: null, isCover: true })]);
    expect((await listRecipes(db, ALICE)).find((x) => x.id === id)!.cover).toEqual({ thumbPath: null, externalUrl: "https://example.com/cake.jpg" });
    // editing it keeps the link
    await updateRecipe(db, ALICE, id, { ...r.draft, title: "Renamed" });
    expect((await getRecipe(db, ALICE, id))!.draft.coverPhotoId).toBe(r.draft.coverPhotoId);
  });
});
