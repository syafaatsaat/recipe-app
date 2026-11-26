import { cn } from "cn";
import type { RenderedIngredient } from "@/lib/culinary";
import type { RenderLine } from "@/lib/recipes/render-input";

export function IngredientLine({ line, amount }: { line: RenderLine; amount: RenderedIngredient | undefined }) {
  const text = amount?.amount ?? null;
  return (
    <li className="grid grid-cols-[136px_minmax(0,1fr)] gap-3 border-b border-border/70 py-3 text-[15px] leading-snug">
      <span
        className={cn(
          "font-mono text-[14.5px]",
          !text ? "text-muted-foreground" : amount?.leaveningWarning ? "font-medium text-destructive" : "font-medium",
        )}
      >
        {text ?? "to taste"}
      </span>
      <span>
        {!amount?.amountIncludesName && line.input.name}
        {line.input.preparation && <span className="text-muted-foreground">, {line.input.preparation}</span>}
        {line.isOptional && <span className="text-muted-foreground"> (optional)</span>}
        {line.note && <span className="block text-[13px] text-muted-foreground">{line.note}</span>}
        {amount?.original && (
          <span className="mt-[3px] block font-mono text-xs text-muted-foreground">orig. {amount.original}</span>
        )}
        {amount?.leaveningWarning && (
          <span className="mt-0.5 block text-[13px] text-destructive">May not rise the same at this size</span>
        )}
      </span>
    </li>
  );
}
