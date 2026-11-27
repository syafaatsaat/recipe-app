"use client";

import { ArrowDown, ArrowUp, Ellipsis, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, useId } from "react";
import { exactIngredient, saveRecipe } from "@/app/(app)/recipes/actions";
import { Photo } from "@/components/photos/photo";
import { PhotoPicker } from "@/components/photos/photo-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PanOption } from "@/db/pans";
import { UNIT_CODES, UNITS, type UnitCode } from "@/lib/culinary/units";
import { FLAG_BELOW } from "@/lib/import/parse-line";
import {
  issuesToErrors,
  move,
  newKey,
  newLine,
  toDraft,
  type EditorState,
  type FieldErrors,
  type LineState,
  type PhotoState,
  type SectionState,
} from "@/lib/recipes/editor-state";
import { cn } from "@/lib/utils";
import { IngredientPicker } from "./ingredient-picker";

const UNIT_LABEL: Record<UnitCode, string> = {
  tsp: "tsp", tbsp: "tbsp", fl_oz: "fl oz", cup: "cup", pint: "pint", quart: "quart",
  ml: "ml", l: "L", g: "g", kg: "kg", oz: "oz", lb: "lb",
};
const US_UNITS = UNIT_CODES.filter((u) => UNITS[u].system === "us");
const METRIC_UNITS = UNIT_CODES.filter((u) => UNITS[u].system === "metric");

const selectClass =
  "h-11 w-full rounded-[10px] border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-[13px] text-destructive">
      {message}
    </p>
  ) : null;
}

function Labeled({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function RowMenu({ label, onUp, onDown, onRemove }: { label: string; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`${label} options`}>
          <Ellipsis className="size-5" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!onUp} onSelect={onUp}>
          <ArrowUp /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!onDown} onSelect={onDown}>
          <ArrowDown /> Move down
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

export function RecipeEditor({
  recipeId,
  versionNo,
  initial,
  pans,
  userId,
}: {
  recipeId: string | null;
  versionNo: number;
  initial: EditorState;
  pans: PanOption[];
  /** the folder photos upload to (storage RLS checks it too) */
  userId: string;
}) {
  const [s, setS] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();
  // unique per editor: /recipes/new and /edit can both stay mounted (hidden) in Next 16
  const uid = useId();
  const fid = (k: string) => `${uid}${k}`;

  const set = (patch: Partial<EditorState>) => setS((prev) => ({ ...prev, ...patch }));
  const setSection = (key: string, f: (sec: SectionState) => SectionState) =>
    setS((prev) => ({ ...prev, sections: prev.sections.map((sec) => (sec.key === key ? f(sec) : sec)) }));
  /** An edit by hand counts as checking an imported line, so its flag clears (`touched`). */
  const setLine = (secKey: string, lineKey: string, patch: Partial<LineState>, touched = true) =>
    setSection(secKey, (sec) => ({
      ...sec,
      lines: sec.lines.map((l) =>
        l.key === lineKey ? { ...l, ...patch, ...(touched && l.parseConfidence !== null ? { parseConfidence: 1 } : {}) } : l,
      ),
    }));

  /** A new upload, remembered by id; `place` puts it on the cover or a step. */
  const addPhoto = (p: PhotoState, place: { cover: true } | { step: string }) =>
    setS((prev) => ({
      ...prev,
      photos: { ...prev.photos, [p.id]: p },
      ...("cover" in place
        ? { coverPhotoId: p.id }
        : { steps: prev.steps.map((t) => (t.key === place.step ? { ...t, photoId: p.id } : t)) }),
    }));
  const cover = s.coverPhotoId ? (s.photos[s.coverPhotoId] ?? null) : null;

  /** When a typed name is exactly a catalog name or alias, link it (the user can still change it). */
  async function autoMatch(secKey: string, line: LineState) {
    if (line.ingredient || !line.name.trim()) return;
    const match = await exactIngredient(line.name);
    if (match) setLine(secKey, line.key, { ingredient: match }, false);
  }

  function save() {
    setFormError(null);
    const r = toDraft(s);
    if (!r.ok) {
      setErrors(r.errors);
      setFormError("Some fields need fixing.");
      return;
    }
    setErrors({});
    startSave(async () => {
      const res = await saveRecipe(recipeId, r.draft);
      // success redirects; only failures come back
      if (res) {
        setFormError(res.error);
        if (res.issues) setErrors(issuesToErrors(s, res.issues));
      }
    });
  }

  const multi = s.sections.length > 1;
  const nextVersion = recipeId ? versionNo + 1 : 1;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-5 px-6 pb-32">
        <div className="flex items-center justify-between">
          <Link
            href={recipeId ? `/recipes/${recipeId}` : "/recipes"}
            className="-ml-2 flex h-11 items-center gap-1 px-2 text-[15px] no-underline"
          >
            <X className="size-5" strokeWidth={1.5} /> Cancel
          </Link>
          <span className="text-xs tracking-[0.12em] text-muted-foreground uppercase">
            {recipeId ? `Editing · v${versionNo}` : "New recipe"}
          </span>
        </div>

        <section aria-label="Cover photo" className="flex flex-col gap-2">
          {cover ? (
            <>
              <Photo
                src={cover.src}
                thumbSrc={cover.thumbSrc}
                width={cover.width}
                height={cover.height}
                alt={cover.alt}
                imported={cover.imported}
                eager
                className="h-[210px] w-full rounded-[6px_22px_8px_18px]"
              />
              {cover.imported && <p className="text-xs text-muted-foreground">Photo from {hostOf(cover.src) ?? "the source"}, shown from their site.</p>}
              <div className="flex flex-wrap items-start gap-2">
                <PhotoPicker userId={userId} label="Replace" ariaLabel="Replace the cover photo" onAdded={(p) => addPhoto(p, { cover: true })} />
                <Button type="button" variant="ghost" onClick={() => set({ coverPhotoId: null })}>
                  <Trash2 data-icon="inline-start" /> Remove
                </Button>
              </div>
              {!cover.imported && (
                <Labeled id={fid("alt")} label="Describe the photo (optional, for screen readers)">
                  <Input
                    id={fid("alt")}
                    value={cover.alt}
                    maxLength={200}
                    onChange={(e) => setS((prev) => ({ ...prev, photos: { ...prev.photos, [cover.id]: { ...cover, alt: e.target.value } } }))}
                  />
                </Labeled>
              )}
            </>
          ) : (
            <div className="grain flex h-[150px] items-center justify-center rounded-[6px_22px_8px_18px]">
              <PhotoPicker userId={userId} label="Add cover photo" onAdded={(p) => addPhoto(p, { cover: true })} className="bg-card" />
            </div>
          )}
          <FieldError id={fid("photos-error")} message={errors.photos} />
        </section>

        <Labeled id={fid("title")} label="Title" error={errors.title}>
          <Input
            id={fid("title")}
            value={s.title}
            onChange={(e) => set({ title: e.target.value })}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? fid("title-error") : undefined}
            className="h-12 font-heading text-xl font-semibold md:text-xl"
          />
        </Labeled>

        <Labeled id={fid("description")} label="Short description (optional)" error={errors.description}>
          <Textarea id={fid("description")} value={s.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
        </Labeled>

        <div className="grid grid-cols-2 gap-3">
          <Labeled id={fid("yieldQty")} label="Makes" error={errors.yieldQty}>
            <div className="flex gap-2">
              <Input
                id={fid("yieldQty")}
                inputMode="decimal"
                value={s.yieldQty}
                onChange={(e) => set({ yieldQty: e.target.value })}
                aria-invalid={!!errors.yieldQty}
                className="w-16 font-mono"
                placeholder="12"
              />
              <Input
                aria-label="What it makes"
                value={s.yieldUnit}
                onChange={(e) => set({ yieldUnit: e.target.value })}
                placeholder="squares"
              />
            </div>
          </Labeled>
          <Labeled id={fid("pan")} label="Pan">
            <select
              id={fid("pan")}
              className={selectClass}
              value={s.panId ?? ""}
              onChange={(e) => set({ panId: e.target.value || null })}
            >
              <option value="">No pan</option>
              {pans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled id={fid("prepMin")} label="Prep (min)" error={errors.prepMin}>
            <Input id={fid("prepMin")} inputMode="numeric" value={s.prepMin} onChange={(e) => set({ prepMin: e.target.value })} aria-invalid={!!errors.prepMin} className="font-mono" />
          </Labeled>
          <Labeled id={fid("cookMin")} label="Cook (min)" error={errors.cookMin}>
            <Input id={fid("cookMin")} inputMode="numeric" value={s.cookMin} onChange={(e) => set({ cookMin: e.target.value })} aria-invalid={!!errors.cookMin} className="font-mono" />
          </Labeled>
          <Labeled id={fid("ovenTemp")} label="Oven" error={errors.ovenTemp}>
            <div className="flex gap-2">
              <Input id={fid("ovenTemp")} inputMode="numeric" value={s.ovenTemp} onChange={(e) => set({ ovenTemp: e.target.value })} aria-invalid={!!errors.ovenTemp} className="font-mono" placeholder="350" />
              <select
                aria-label="Oven units"
                className={cn(selectClass, "w-20")}
                value={s.ovenUnit}
                onChange={(e) => set({ ovenUnit: e.target.value as "F" | "C" })}
              >
                <option value="F">°F</option>
                <option value="C">°C</option>
              </select>
            </div>
          </Labeled>
        </div>

        {s.sections.map((sec, si) => (
          <section key={sec.key} className="flex flex-col" aria-label={sec.title || "Ingredients"}>
            <div className="flex items-center gap-2 border-b border-border pb-2">
              {multi ? (
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    aria-label="Section title"
                    placeholder="Section title, like Batter"
                    value={sec.title}
                    onChange={(e) => setSection(sec.key, (x) => ({ ...x, title: e.target.value }))}
                    aria-invalid={!!errors[`section:${sec.key}:title`]}
                    className="font-heading text-lg font-medium md:text-lg"
                  />
                  <FieldError id={fid(`section-${sec.key}-error`)} message={errors[`section:${sec.key}:title`]} />
                </div>
              ) : (
                <h2 className="flex-1 text-xl font-medium">Ingredients</h2>
              )}
              {multi && (
                <RowMenu
                  label="Section"
                  onUp={si > 0 ? () => set({ sections: move(s.sections, si, -1) }) : undefined}
                  onDown={si < s.sections.length - 1 ? () => set({ sections: move(s.sections, si, 1) }) : undefined}
                  onRemove={() => set({ sections: s.sections.filter((x) => x.key !== sec.key) })}
                />
              )}
            </div>

            {sec.lines.map((l, li) => {
              const amountErr = errors[`line:${l.key}:amount`];
              const nameErr = errors[`line:${l.key}:name`];
              const unchecked = !!l.rawText && l.parseConfidence !== null && l.parseConfidence < FLAG_BELOW;
              return (
                <div
                  key={l.key}
                  className={cn(
                    "flex flex-col gap-2 border-b border-border/70 py-3",
                    ((!l.ingredient && l.name.trim()) || unchecked) && "-mx-3 bg-warning-muted px-3",
                    unchecked && "border-l-2 border-l-destructive",
                  )}
                >
                  <div className="flex gap-2">
                    <Input
                      aria-label="Amount"
                      inputMode="decimal"
                      placeholder="1½"
                      value={l.amount}
                      onChange={(e) => setLine(sec.key, l.key, { amount: e.target.value })}
                      aria-invalid={!!amountErr}
                      className="w-20 font-mono"
                    />
                    <select
                      aria-label="Unit"
                      className={cn(selectClass, "w-24")}
                      value={l.unitCode ?? ""}
                      onChange={(e) => setLine(sec.key, l.key, { unitCode: (e.target.value || null) as UnitCode | null })}
                    >
                      <option value="">—</option>
                      <optgroup label="US">
                        {US_UNITS.map((u) => (
                          <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Metric">
                        {METRIC_UNITS.map((u) => (
                          <option key={u} value={u}>{UNIT_LABEL[u]}</option>
                        ))}
                      </optgroup>
                    </select>
                    <Input
                      aria-label="Ingredient"
                      placeholder="flour"
                      value={l.name}
                      onChange={(e) => setLine(sec.key, l.key, { name: e.target.value, ingredient: null })}
                      onBlur={() => autoMatch(sec.key, l)}
                      aria-invalid={!!nameErr}
                      className="min-w-0 flex-1"
                    />
                    <RowMenu
                      label="Ingredient"
                      onUp={li > 0 ? () => setSection(sec.key, (x) => ({ ...x, lines: move(x.lines, li, -1) })) : undefined}
                      onDown={li < sec.lines.length - 1 ? () => setSection(sec.key, (x) => ({ ...x, lines: move(x.lines, li, 1) })) : undefined}
                      onRemove={() => setSection(sec.key, (x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <IngredientPicker
                      name={l.name}
                      value={l.ingredient}
                      onChange={(ingredient) => setLine(sec.key, l.key, { ingredient })}
                    />
                    <Input
                      aria-label="Preparation"
                      placeholder="sifted, melted…"
                      value={l.preparation}
                      onChange={(e) => setLine(sec.key, l.key, { preparation: e.target.value })}
                      className="h-9 min-w-0 flex-1 italic"
                    />
                    <label className="flex h-9 items-center gap-1.5 text-[13px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={l.isOptional}
                        onChange={(e) => setLine(sec.key, l.key, { isOptional: e.target.checked })}
                        className="size-4 accent-primary"
                      />
                      optional
                    </label>
                  </div>
                  {unchecked && (
                    <p className="text-[13px] leading-snug text-muted-foreground">
                      Imported from <span className="font-mono text-xs text-foreground">{l.rawText}</span>. Check it, then edit or keep it.
                    </p>
                  )}
                  <FieldError id={fid(`${l.key}-amount-error`)} message={amountErr} />
                  <FieldError id={fid(`${l.key}-name-error`)} message={nameErr} />
                  {!l.ingredient && l.name.trim() && (
                    <p className="text-[13px] leading-snug text-destructive">
                      Not in your ingredients, so it can’t show grams. Tap “Not matched” to pick or add one.
                    </p>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              className="mt-1 self-start text-primary"
              onClick={() => setSection(sec.key, (x) => ({ ...x, lines: [...x.lines, newLine()] }))}
            >
              <Plus data-icon="inline-start" /> Add ingredient
            </Button>
          </section>
        ))}

        <Button
          type="button"
          variant="outline"
          className="border-dashed text-primary"
          onClick={() => set({ sections: [...s.sections, { key: newKey("s"), title: "", lines: [newLine()] }] })}
        >
          <Plus data-icon="inline-start" /> Add a section
        </Button>

        <section className="flex flex-col gap-3" aria-labelledby={fid("method-heading")}>
          <h2 id={fid("method-heading")} className="border-b border-border pb-2 text-xl font-medium">
            Method
          </h2>
          {s.steps.map((t, ti) => (
            <div key={t.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-1">
              <span className="pt-2.5 font-mono text-primary">{ti + 1}</span>
              <div className="flex flex-col gap-1">
                <Textarea
                  aria-label={`Step ${ti + 1}`}
                  value={t.body}
                  onChange={(e) =>
                    set({ steps: s.steps.map((x) => (x.key === t.key ? { ...x, body: e.target.value } : x)) })
                  }
                  aria-invalid={!!errors[`step:${t.key}`]}
                  rows={2}
                />
                <FieldError id={fid(`step-${t.key}-error`)} message={errors[`step:${t.key}`]} />
                {t.photoId && s.photos[t.photoId] ? (
                  <div className="flex items-start gap-2">
                    <Photo
                      src={s.photos[t.photoId].thumbSrc ?? s.photos[t.photoId].src}
                      width={s.photos[t.photoId].width}
                      height={s.photos[t.photoId].height}
                      alt={`Step ${ti + 1}`}
                      className="h-24 w-32 rounded-[4px_14px_6px_12px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove the photo from step ${ti + 1}`}
                      onClick={() => set({ steps: s.steps.map((x) => (x.key === t.key ? { ...x, photoId: null } : x)) })}
                    >
                      <Trash2 data-icon="inline-start" /> Remove photo
                    </Button>
                  </div>
                ) : (
                  <PhotoPicker
                    userId={userId}
                    label="Add photo"
                    ariaLabel={`Add a photo to step ${ti + 1}`}
                    variant="ghost"
                    className="self-start text-muted-foreground"
                    onAdded={(p) => addPhoto(p, { step: t.key })}
                  />
                )}
              </div>
              <RowMenu
                label={`Step ${ti + 1}`}
                onUp={ti > 0 ? () => set({ steps: move(s.steps, ti, -1) }) : undefined}
                onDown={ti < s.steps.length - 1 ? () => set({ steps: move(s.steps, ti, 1) }) : undefined}
                onRemove={() => set({ steps: s.steps.filter((x) => x.key !== t.key) })}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start text-primary"
            onClick={() => set({ steps: [...s.steps, { key: newKey("t"), body: "", photoId: null }] })}
          >
            <Plus data-icon="inline-start" /> Add step
          </Button>
        </section>
      </div>

      <div className="sticky bottom-0 mt-auto flex items-center gap-3.5 border-t border-border bg-card px-6 pt-3 pb-5">
        <p className={cn("flex-1 text-[13px] leading-snug", formError ? "text-destructive" : "text-muted-foreground")} role={formError ? "alert" : undefined}>
          {formError ?? (recipeId ? `Saving makes version ${nextVersion}. Version ${versionNo} stays in history.` : "Saving creates version 1.")}
        </p>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
