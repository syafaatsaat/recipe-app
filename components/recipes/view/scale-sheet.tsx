"use client";

import type { PanOption } from "@/db/pans";
import type { RenderInput, ScaleState } from "@/lib/culinary";
import type { RecipeDraft } from "@/lib/recipes/schema";

// Placeholder until M4 step 4 (Factor / Yield / Pan tabs).
export function ScaleSheet(_props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: RenderInput;
  draft: RecipeDraft;
  pans: PanOption[];
  scale: ScaleState;
  onApply: (next: ScaleState) => void;
}) {
  return null;
}
