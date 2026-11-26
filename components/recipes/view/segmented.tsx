import { cn } from "cn";

/** The pill segmented control from doc §8 (units toggle, sheet tabs). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  role = "group",
  className,
}: {
  label: string;
  options: readonly { value: T; label: string; controls?: string }[];
  value: T;
  onChange: (v: T) => void;
  /** "tablist" for the sheet's tabs */
  role?: "group" | "tablist";
  className?: string;
}) {
  const tabs = role === "tablist";
  return (
    <div role={role} aria-label={label} className={cn("flex rounded-full border border-input p-[3px]", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={tabs ? "tab" : undefined}
            aria-selected={tabs ? on : undefined}
            aria-controls={tabs ? o.controls : undefined}
            aria-pressed={tabs ? undefined : on}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-[38px] min-w-16 flex-1 rounded-full px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-card",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
