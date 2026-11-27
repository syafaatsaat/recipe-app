// Recipe photos (doc §3.12): the pure rules. Sizes for the browser's resize, where a
// photo lives in Storage, which links are safe to show, and what a save must change
// in recipe_images. No I/O.
import type { RecipeDraft } from "@/lib/recipes/schema";

export const FULL_EDGE = 1600;
export const THUMB_EDGE = 400;
/** what the picker accepts before resizing */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** the bucket's limit (migration 006) */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** how long a signed photo URL works */
export const SIGNED_URL_SECONDS = 3600;

/** The size to draw at so the long edge is at most `edge`; never upscaled. */
export function fitWithin(width: number, height: number, edge: number): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Where an upload's two sizes live: the first folder is the owner, which storage RLS checks. */
export function photoPaths(userId: string, photoId: string) {
  return { full: `${userId}/${photoId}/full`, thumb: `${userId}/${photoId}/thumb` };
}

/** An imported photo's link, if it's one we'll show: http(s), at most 2000 characters. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url || url.length > 2000) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A recipe_images row, as far as a save cares. */
export interface PhotoRow {
  id: string;
  origin: "upload" | "import";
  storagePath: string | null;
  thumbPath: string | null;
}

export interface PhotoSyncPlan {
  /** photos in the draft with no row yet: uploads to check and insert */
  insert: RecipeDraft["photos"];
  /** rows the draft no longer uses */
  remove: string[];
  /** their storage objects, removed after the save commits */
  removePaths: string[];
  coverId: string | null;
  /** the photo of each step, by step index */
  stepPhotoIds: (string | null)[];
  /** id → position, in the draft's order */
  positions: Map<string, number>;
}

export function planPhotoSync(rows: readonly PhotoRow[], draft: RecipeDraft): PhotoSyncPlan {
  const have = new Set(rows.map((r) => r.id));
  const want = new Set(draft.photos.map((p) => p.id));
  const gone = rows.filter((r) => !want.has(r.id));
  return {
    insert: draft.photos.filter((p) => !have.has(p.id)),
    remove: gone.map((r) => r.id),
    removePaths: gone.flatMap((r) => (r.origin === "upload" ? [r.storagePath, r.thumbPath].filter((p): p is string => !!p) : [])),
    coverId: draft.coverPhotoId,
    stepPhotoIds: draft.steps.map((s) => s.photoId),
    positions: new Map(draft.photos.map((p, i) => [p.id, i])),
  };
}
