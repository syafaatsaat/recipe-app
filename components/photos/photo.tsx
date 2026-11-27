"use client";
// A recipe photo (doc §3.12): a signed upload with its two sizes, or an imported link
// loaded without a referrer. Anything that fails to load shows the grain placeholder.
import { useState } from "react";
import { cn } from "cn";
import { fitWithin, THUMB_EDGE } from "@/lib/photos/photos";

export interface PhotoProps {
  src: string | null;
  thumbSrc?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  imported?: boolean;
  /** CSS sizes for srcset, e.g. "100vw" or "76px" */
  sizes?: string;
  eager?: boolean;
  className?: string;
}

export function Photo({ src, thumbSrc = null, width = null, height = null, alt, imported = false, sizes = "100vw", eager = false, className }: PhotoProps) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <div aria-hidden className={cn("grain", className)} data-photo="placeholder" />;
  const thumbW = width && height ? fitWithin(width, height, THUMB_EDGE).width : null;
  const srcSet = !imported && thumbSrc && width && thumbW && thumbW < width ? `${thumbSrc} ${thumbW}w, ${src} ${width}w` : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized; signed URLs change per render
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={width ?? undefined}
      height={height ?? undefined}
      alt={alt ?? ""}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy={imported ? "no-referrer" : undefined}
      onError={() => setFailed(src)}
      className={cn("bg-muted object-cover", className)}
    />
  );
}
