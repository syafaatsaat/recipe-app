import { CircleAlert } from "lucide-react";

/** Bake-time and leavening notes: clay, between the scale bar and the ingredients, never a modal (doc §8). */
export function WarningList({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul aria-label="Scaling notes" className="mx-6 flex flex-col gap-2 border-b border-border py-3.5">
      {notes.map((n) => (
        <li key={n} role="note" className="flex items-start gap-2.5 text-sm leading-[1.45] text-destructive">
          <CircleAlert aria-hidden className="mt-px size-[18px] flex-none" strokeWidth={1.6} />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}
