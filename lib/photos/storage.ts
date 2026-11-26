import "server-only";
import type { StoredPhoto } from "@/db/photos";
import { createClient } from "@/lib/supabase/server";
import type { PhotoUrls } from "@/lib/recipes/editor-state";
import { photoPaths, safeImageUrl, SIGNED_URL_SECONDS } from "./photos";

// The photos bucket from the server (doc §3.12), always with the signed-in user's
// session, so storage RLS (own folder only) applies to every call here too.

const BUCKET = "photos";

/** True when every id has both sizes in the user's own folder. */
export async function uploadsExist(userId: string, ids: readonly string[]): Promise<boolean> {
  if (!ids.length) return true;
  const bucket = (await createClient()).storage.from(BUCKET);
  const checks = await Promise.all(
    ids.flatMap((id) => {
      const p = photoPaths(userId, id);
      return [bucket.exists(p.full), bucket.exists(p.thumb)];
    }),
  );
  return checks.every((c) => c.data === true);
}

/** Signs every upload path in one call; imported photos keep their link. */
export async function photoUrls(photos: readonly Pick<StoredPhoto, "id" | "origin" | "storagePath" | "thumbPath" | "externalUrl">[]): Promise<PhotoUrls> {
  const paths = photos.flatMap((p) => (p.origin === "upload" ? [p.storagePath, p.thumbPath].filter((x): x is string => !!x) : []));
  const signed = await signPaths(paths);
  return Object.fromEntries(
    photos.map((p) => {
      if (p.origin === "import") {
        const url = safeImageUrl(p.externalUrl);
        return [p.id, { src: url, thumbSrc: url, imported: true }];
      }
      return [p.id, { src: signed.get(p.storagePath ?? "") ?? null, thumbSrc: signed.get(p.thumbPath ?? "") ?? null, imported: false }];
    }),
  );
}

/** path → signed URL. A failure leaves the photos unsigned (the page shows placeholders). */
export async function signPaths(paths: readonly string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data, error } = await (await createClient()).storage.from(BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS);
  if (error || !data) {
    console.error("signing photos failed", error);
    return new Map();
  }
  return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Removes objects after the rows are gone; a failure only leaves files behind, so it's logged. */
export async function removeObjects(paths: readonly string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await (await createClient()).storage.from(BUCKET).remove([...paths]);
  if (error) console.error("removing photos failed", error);
}
