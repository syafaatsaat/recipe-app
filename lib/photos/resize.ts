// Browser-only: a picked photo → the two sizes we store (doc §3.12). Drawing to a canvas
// applies the EXIF rotation and drops the EXIF itself (so GPS data never leaves the phone).
import { fitWithin, FULL_EDGE, THUMB_EDGE } from "./photos";

export interface Resized {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  type: "image/webp" | "image/jpeg";
}

function encode(bitmap: ImageBitmap, edge: number, type: Resized["type"]): Promise<{ blob: Blob; width: number; height: number }> {
  const size = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no canvas"));
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, ...size }) : reject(new Error("encode failed"))), type, type === "image/webp" ? 0.82 : 0.85),
  );
}

export async function resizePhoto(file: File): Promise<Resized> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let type: Resized["type"] = "image/webp";
    let full = await encode(bitmap, FULL_EDGE, type);
    // a browser that can't encode WebP hands back PNG: use JPEG instead
    if (full.blob.type !== "image/webp") {
      type = "image/jpeg";
      full = await encode(bitmap, FULL_EDGE, type);
    }
    const thumb = await encode(bitmap, THUMB_EDGE, type);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height, type };
  } finally {
    bitmap.close();
  }
}
