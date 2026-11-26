"use client";
// Pick a photo, resize it in the browser and upload both sizes straight to the user's
// folder in the private photos bucket (doc §3.12). The recipe links it on save.
import { ImagePlus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_INPUT_BYTES, MAX_UPLOAD_BYTES, photoPaths } from "@/lib/photos/photos";
import { resizePhoto } from "@/lib/photos/resize";
import type { PhotoState } from "@/lib/recipes/editor-state";
import { browserClient } from "@/lib/supabase/client";

export function PhotoPicker({
  userId,
  label,
  ariaLabel,
  onAdded,
  variant = "outline",
  className,
}: {
  userId: string;
  label: string;
  ariaLabel?: string;
  onAdded: (photo: PhotoState) => void;
  variant?: "outline" | "ghost";
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  async function add(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("That isn’t a photo.");
    if (file.size > MAX_INPUT_BYTES) return setError("That photo is too large (25 MB at most).");
    setBusy(true);
    try {
      let resized;
      try {
        resized = await resizePhoto(file);
      } catch {
        return setError("Couldn’t read that photo. Try a JPEG or PNG.");
      }
      if (resized.full.size > MAX_UPLOAD_BYTES) return setError("That photo is too detailed to store. Try another.");
      const id = crypto.randomUUID();
      const paths = photoPaths(userId, id);
      const bucket = browserClient().storage.from("photos");
      const opts = { contentType: resized.type, upsert: false, cacheControl: "31536000" };
      const full = await bucket.upload(paths.full, resized.full, opts);
      const thumb = full.error ? full : await bucket.upload(paths.thumb, resized.thumb, opts);
      if (full.error || thumb.error) {
        if (!full.error) await bucket.remove([paths.full]);
        return setError("Couldn’t upload. Try again.");
      }
      onAdded({
        id,
        width: resized.width,
        height: resized.height,
        alt: "",
        src: URL.createObjectURL(resized.full),
        thumbSrc: URL.createObjectURL(resized.thumb),
        imported: false,
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={input}
        id={`${uid}file`}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void add(f);
        }}
      />
      <Button
        type="button"
        variant={variant}
        disabled={busy}
        aria-label={ariaLabel}
        aria-describedby={error ? `${uid}error` : undefined}
        onClick={() => input.current?.click()}
        className={className}
      >
        <ImagePlus data-icon="inline-start" /> {busy ? "Uploading…" : label}
      </Button>
      {error && (
        <p id={`${uid}error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
