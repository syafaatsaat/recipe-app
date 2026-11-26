import { describe, expect, it } from "vitest";
import { emptyDraft, type RecipeDraft } from "@/lib/recipes/schema";
import { fitWithin, photoPaths, planPhotoSync, safeImageUrl, type PhotoRow } from "./photos";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const ref = (id: string) => ({ id, width: 1600, height: 1200, alt: null });

describe("fitWithin", () => {
  it.each([
    [4032, 3024, 1600, { width: 1600, height: 1200 }],
    [3024, 4032, 1600, { width: 1200, height: 1600 }],
    [4032, 3024, 400, { width: 400, height: 300 }],
    [800, 600, 1600, { width: 800, height: 600 }],
    [10000, 3, 400, { width: 400, height: 1 }],
  ])("%i×%i within %i", (w, h, edge, out) => {
    expect(fitWithin(w, h, edge)).toEqual(out);
  });
});

describe("paths and links", () => {
  it("puts uploads in the owner's folder", () => {
    expect(photoPaths("u1", A)).toEqual({ full: `u1/${A}/full`, thumb: `u1/${A}/thumb` });
  });

  it("shows only http(s) links of a sane length", () => {
    expect(safeImageUrl("https://example.com/cake.jpg")).toBe("https://example.com/cake.jpg");
    expect(safeImageUrl("http://example.com/a b.jpg")).toBe("http://example.com/a%20b.jpg");
    for (const bad of [null, undefined, "", "javascript:alert(1)", "data:image/png;base64,AA", "/relative.jpg", `https://x.com/${"a".repeat(2000)}`]) {
      expect(safeImageUrl(bad)).toBeNull();
    }
  });
});

describe("planPhotoSync", () => {
  const rows: PhotoRow[] = [
    { id: A, origin: "upload", storagePath: `u/${A}/full`, thumbPath: `u/${A}/thumb` },
    { id: B, origin: "import", storagePath: null, thumbPath: null },
  ];
  const draft = (over: Partial<RecipeDraft>): RecipeDraft => ({ ...emptyDraft(), title: "x", ...over });

  it("inserts new photos, keeps the rest, links the cover and steps in order", () => {
    const plan = planPhotoSync(rows, draft({
      photos: [ref(A), ref(B), ref(C)],
      coverPhotoId: B,
      steps: [{ body: "one", photoId: null }, { body: "two", photoId: C }, { body: "three", photoId: A }],
    }));
    expect(plan.insert.map((p) => p.id)).toEqual([C]);
    expect(plan).toMatchObject({ remove: [], removePaths: [], coverId: B, stepPhotoIds: [null, C, A] });
    expect([...plan.positions]).toEqual([[A, 0], [B, 1], [C, 2]]);
  });

  it("removes what the draft dropped, and an upload's objects with it (a link has none)", () => {
    const plan = planPhotoSync(rows, draft({}));
    expect(plan.remove).toEqual([A, B]);
    expect(plan.removePaths).toEqual([`u/${A}/full`, `u/${A}/thumb`]);
    expect(plan.coverId).toBeNull();
  });
});
