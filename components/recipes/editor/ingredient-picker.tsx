"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { addIngredient, findIngredients } from "@/app/(app)/recipes/actions";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CatalogIngredient } from "@/lib/recipes/render-input";
import { cn } from "@/lib/utils";

/**
 * The chip under an ingredient name: matched (✓ name) or unmatched (?). Tapping it
 * searches the catalog and the user's own ingredients, or adds a new own one
 * with an optional weight per cup (doc §3.7).
 */
export function IngredientPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: CatalogIngredient | null;
  onChange: (i: CatalogIngredient | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<CatalogIngredient[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = query.trim() ? await findIngredients(query) : [];
      if (live) setResults(r);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, open]);

  function openChange(o: boolean) {
    setOpen(o);
    if (o) {
      setQuery(name);
      setAdding(false);
    }
  }

  const pick = (i: CatalogIngredient | null) => {
    onChange(i);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!name.trim()}
          className={cn(
            "inline-flex h-9 max-w-full items-center gap-1 rounded-full border px-3 text-sm disabled:opacity-50",
            value
              ? "border-primary bg-accent"
              : "border-dashed border-destructive bg-card text-destructive",
          )}
          aria-label={value ? `Matched to ${value.name}. Change` : `${name || "Ingredient"} is not matched. Pick one`}
        >
          <span className="truncate">{value ? `${value.name}${value.mine ? " · mine" : ""}` : "Not matched"}</span>
          <span aria-hidden>{value ? "✓" : "?"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(340px,calc(100vw-2rem))] p-0">
        {adding ? (
          <AddForm
            defaultName={query.trim() || name.trim()}
            onBack={() => setAdding(false)}
            onAdded={pick}
          />
        ) : (
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search ingredients" />
            <CommandList>
              <CommandEmpty>Nothing in the catalog or your ingredients.</CommandEmpty>
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => pick(r)} className="justify-between py-2.5">
                      <span>{r.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {r.mine ? "mine" : "catalog"}
                        {value?.id === r.id && <Check className="size-4 text-primary" />}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandGroup>
                {query.trim() && (
                  <CommandItem value="__add" onSelect={() => setAdding(true)} className="py-2.5 font-medium text-primary">
                    <Plus className="size-4" /> Add “{query.trim()}” to my ingredients
                  </CommandItem>
                )}
                <CommandItem value="__none" onSelect={() => pick(null)} className="justify-between py-2.5">
                  <span>Leave unmatched</span>
                  <span className="text-xs text-muted-foreground">no grams</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AddForm({
  defaultName,
  onBack,
  onAdded,
}: {
  defaultName: string;
  onBack: () => void;
  onAdded: (i: CatalogIngredient) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [grams, setGrams] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const g = grams.trim() ? Number(grams) : null;
    if (g !== null && !Number.isFinite(g)) return setError("Grams must be a number, like 85.");
    start(async () => {
      const r = await addIngredient({ name, gramsPerCup: g });
      if (r.ok) onAdded(r.ingredient);
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3.5 p-4">
      <p className="font-heading text-lg font-medium">Add to my ingredients</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-ing-name" className="text-[13px] font-normal text-muted-foreground">
          Name
        </Label>
        <Input id="new-ing-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-ing-grams" className="text-[13px] font-normal text-muted-foreground">
          Weight of 1 cup, in grams (optional)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="new-ing-grams"
            inputMode="decimal"
            placeholder="e.g. 85"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="font-mono"
            aria-describedby="new-ing-grams-hint"
          />
          <span className="font-mono text-sm whitespace-nowrap text-muted-foreground">g / cup</span>
        </div>
        <p id="new-ing-grams-hint" className="text-xs leading-snug text-muted-foreground">
          Skip it if you don’t know. The line still scales; it just won’t show grams.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={pending} className="flex-1">
          Back
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !name.trim()} className="flex-[2]">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}
