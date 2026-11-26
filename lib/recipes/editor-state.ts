// The ingredient editor's form state, and its conversion to and from RecipeDraft.
// Pure (no React), so the rules for turning typed text into a draft are unit-tested.
import { formatQuantity, parseQuantity, plainFractions } from "@/lib/culinary/quantity";
import type { ScalingRule } from "@/lib/culinary/schemas";
import type { UnitCode } from "@/lib/culinary/units";
import type { CatalogIngredient } from "./render-input";
import { enteredOven, fahrenheitToC, recipeDraftSchema, type RecipeDraft } from "./schema";

export interface LineState {
  key: string;
  amount: string;
  unitCode: UnitCode | null;
  name: string;
  ingredient: CatalogIngredient | null;
  preparation: string;
  isOptional: boolean;
  // not editable in M3, kept so saving doesn't drop them
  note: string | null;
  scalingRule: ScalingRule | null;
  /** import provenance (doc §3.4), carried through edits */
  rawText: string | null;
  parseConfidence: number | null;
}
export interface SectionState {
  key: string;
  title: string;
  lines: LineState[];
}
export interface StepState {
  key: string;
  body: string;
}
export interface EditorState {
  title: string;
  description: string;
  yieldQty: string;
  yieldUnit: string;
  panId: string | null;
  prepMin: string;
  cookMin: string;
  ovenTemp: string;
  ovenUnit: "F" | "C";
  sections: SectionState[];
  steps: StepState[];
}

/** Field errors keyed like "title", "line:<key>:amount", "section:<key>:title", "step:<key>". */
export type FieldErrors = Record<string, string>;

let seq = 0;
export const newKey = (prefix: string) => `${prefix}${++seq}`;

export function newLine(): LineState {
  return {
    key: newKey("l"), amount: "", unitCode: null, name: "", ingredient: null,
    preparation: "", isOptional: false, note: null, scalingRule: null, rawText: null, parseConfidence: null,
  };
}

export function toEditorState(draft: RecipeDraft, catalog: Record<string, CatalogIngredient>): EditorState {
  return {
    title: draft.title,
    description: draft.description ?? "",
    yieldQty: draft.yieldQty === null ? "" : formatQuantity(draft.yieldQty),
    yieldUnit: draft.yieldUnit ?? "",
    panId: draft.panId,
    prepMin: draft.prepMin === null ? "" : String(draft.prepMin),
    cookMin: draft.cookMin === null ? "" : String(draft.cookMin),
    // reopens in the unit it was entered in (°F when unknown, as before)
    ovenTemp: draft.ovenTempC === null ? "" : String(enteredOven(draft.ovenTempC, draft.ovenUnit ?? "F")),
    ovenUnit: draft.ovenUnit ?? "F",
    sections: draft.sections.map((s) => ({
      key: newKey("s"),
      title: s.title ?? "",
      lines: s.ingredients.map((l) => ({
        key: newKey("l"),
        // typed form ("1 1/2"): the glyphs are hard to read in a text field (parseQuantity reads both)
        amount: plainFractions(formatQuantity(l.quantity, l.quantityMax)),
        unitCode: l.unitCode,
        name: l.name,
        ingredient: l.ingredientId ? (catalog[l.ingredientId] ?? null) : null,
        preparation: l.preparation ?? "",
        isOptional: l.isOptional,
        note: l.note,
        scalingRule: l.scalingRule,
        rawText: l.rawText,
        parseConfidence: l.parseConfidence,
      })),
    })),
    steps: draft.steps.map((s) => ({ key: newKey("t"), body: s.body })),
  };
}

function wholeMinutes(text: string, key: string, errors: FieldErrors): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t) || Number(t) > 10_000) {
    errors[key] = "Whole minutes, like 25.";
    return null;
  }
  return Number(t);
}

/**
 * Typed fields → RecipeDraft. Lines with nothing typed are dropped, and so are
 * empty steps. Returns field errors instead of a draft when anything is wrong.
 */
export function toDraft(s: EditorState): { ok: true; draft: RecipeDraft } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  let yieldQty: number | null = null;
  const y = parseQuantity(s.yieldQty);
  if (!y.ok) errors.yieldQty = y.error;
  else if (y.quantityMax !== null) errors.yieldQty = "Use one number for how many it makes.";
  else yieldQty = y.quantity;

  let ovenTempC: number | null = null;
  if (s.ovenTemp.trim()) {
    const t = Number(s.ovenTemp.trim());
    const c = s.ovenUnit === "F" ? fahrenheitToC(t) : t;
    if (!Number.isFinite(t) || c <= 0 || c > 400) errors.ovenTemp = "Enter an oven temperature, like 350.";
    else ovenTempC = c;
  }

  const isBlank = (l: LineState) => !l.amount.trim() && !l.name.trim() && !l.preparation.trim() && l.unitCode === null;
  const sections = s.sections.map((sec) => ({
    title: sec.title,
    ingredients: sec.lines.filter((l) => !isBlank(l)).map((l) => {
      const q = parseQuantity(l.amount);
      if (!q.ok) errors[`line:${l.key}:amount`] = q.error;
      if (!l.name.trim()) errors[`line:${l.key}:name`] = "Name the ingredient.";
      if (q.ok && q.quantity === null && l.unitCode !== null) errors[`line:${l.key}:amount`] = "Add an amount for the unit, or clear the unit.";
      return {
        quantity: q.ok ? q.quantity : null,
        quantityMax: q.ok ? q.quantityMax : null,
        unitCode: l.unitCode,
        ingredientId: l.ingredient?.id ?? null,
        name: l.name,
        preparation: l.preparation,
        note: l.note,
        isOptional: l.isOptional,
        scalingRule: l.scalingRule,
        rawText: l.rawText,
        parseConfidence: l.parseConfidence,
      };
    }),
  }));
  if (s.sections.length > 1) {
    for (const sec of s.sections) if (!sec.title.trim()) errors[`section:${sec.key}:title`] = "Name this section.";
  }

  const candidate = {
    title: s.title,
    description: s.description,
    yieldQty,
    yieldUnit: s.yieldUnit,
    panId: s.panId,
    prepMin: wholeMinutes(s.prepMin, "prepMin", errors),
    cookMin: wholeMinutes(s.cookMin, "cookMin", errors),
    ovenTempC,
    ovenUnit: ovenTempC === null ? null : s.ovenUnit,
    sections,
    steps: s.steps.filter((t) => t.body.trim()).map((t) => ({ body: t.body })),
  };
  if (!s.title.trim()) errors.title = "Give the recipe a title.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const parsed = recipeDraftSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(s, parsed.error.issues) };
  return { ok: true, draft: parsed.data };
}

/** Maps schema issue paths (from the client or the server) onto editor field keys. */
export function issuesToErrors(s: EditorState, issues: readonly { path: readonly PropertyKey[] | string; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  // drop the same blank lines/steps toDraft drops, so indices line up
  const sections = s.sections.map((sec) => ({
    ...sec,
    lines: sec.lines.filter((l) => l.amount.trim() || l.name.trim() || l.preparation.trim() || l.unitCode !== null),
  }));
  const steps = s.steps.filter((t) => t.body.trim());
  for (const issue of issues) {
    const p = typeof issue.path === "string" ? issue.path.split(".") : issue.path.map(String);
    let key = "form";
    if (p[0] === "sections" && p.length >= 4 && p[2] === "ingredients") {
      const line = sections[Number(p[1])]?.lines[Number(p[3])];
      if (line) key = `line:${line.key}:${p[4] === "name" ? "name" : p[4] === "preparation" ? "preparation" : "amount"}`;
    } else if (p[0] === "sections" && p.length >= 3 && p[2] === "title") {
      const sec = sections[Number(p[1])];
      if (sec) key = `section:${sec.key}:title`;
    } else if (p[0] === "steps" && p.length >= 2) {
      const step = steps[Number(p[1])];
      if (step) key = `step:${step.key}`;
    } else if (p.length === 1 && ["title", "description", "yieldQty", "yieldUnit", "prepMin", "cookMin", "ovenTempC"].includes(p[0])) {
      key = p[0] === "ovenTempC" ? "ovenTemp" : p[0];
    }
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Move item i by delta (-1 up, +1 down); out of range is a no-op. */
export function move<T>(items: readonly T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (i < 0 || i >= items.length || j < 0 || j >= items.length) return [...items];
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
