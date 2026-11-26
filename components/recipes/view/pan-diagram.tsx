import type { PanDiagram as Diagram } from "@/lib/recipes/scale-view";

// Pans drawn to one shared scale (lib/recipes/scale-view.ts panOptions), with a
// width rule underneath, as on the canvas.
export function PanDiagram({ diagram: d }: { diagram: Diagram }) {
  const cx = 55;
  const cy = 32;
  return (
    <svg width="110" height="70" viewBox="0 0 110 70" aria-hidden className="text-foreground">
      {d.kind === "round" && (
        <>
          <circle cx={cx} cy={cy} r={d.r} fill="none" stroke="currentColor" strokeWidth="1" />
          <Rule w={d.r * 2} />
        </>
      )}
      {d.kind === "rect" && (
        <>
          <rect x={cx - d.w / 2} y={cy - d.h / 2} width={d.w} height={d.h} fill="none" stroke="currentColor" strokeWidth="1" />
          <Rule w={d.w} />
        </>
      )}
      {d.kind === "ring" && (
        <>
          <circle cx={cx} cy={cy} r="24" fill="none" stroke="currentColor" strokeWidth="1" />
          <circle cx={cx} cy={cy} r="8" fill="none" stroke="currentColor" strokeWidth="1" />
        </>
      )}
      {d.kind === "muffin" &&
        [0, 1, 2, 3].flatMap((col) =>
          [0, 1, 2].map((row) => (
            <circle key={`${col}-${row}`} cx={28 + col * 18} cy={14 + row * 18} r="7" fill="none" stroke="currentColor" strokeWidth="1" />
          )),
        )}
    </svg>
  );
}

function Rule({ w }: { w: number }) {
  const x = 55 - w / 2;
  return <path d={`M${x} 64h${w}M${x} 61v6M${x + w} 61v6`} stroke="var(--muted-foreground)" strokeWidth="0.8" />;
}
