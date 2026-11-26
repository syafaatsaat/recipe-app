// Extracted recipe → a RecipeDraft for the review screen and the save, plus each
// line's parse (confidence, fix). Pure. Catalog matching happens on the server
// (db/ingredients.ts matchFirst); here every ingredientId is null.
import { MAX_QUANTITY, parseQuantity } from "@/lib/culinary/quantity";
import { fahrenheitToC, type RecipeDraft } from "@/lib/recipes/schema";
import type { ExtractedRecipe } from "./extract";
import { parseLine, type ParsedLine } from "./parse-line";

export interface ImportSource {
  method: ExtractedRecipe["method"];
  url: string | null;
  siteName: string | null;
  imageUrl: string | null;
}

export interface ImportDraft {
  draft: RecipeDraft;
  /** parsed[s][i] belongs to draft.sections[s].ingredients[i] */
  parsed: ParsedLine[][];
  source: ImportSource;
}

/** "8 slices" → 8 slices, "Serves 4" → 4 servings, "4–6 servings" → 4 servings. */
export function parseYield(text: string | null): { qty: number | null; unit: string | null } {
  if (!text) return { qty: null, unit: null };
  const serves = /^\s*(serves|servings?|for)\b/i.test(text);
  const s = text.replace(/^\s*(?:serves|makes|yields?|servings?|for)\b\s*:?\s*/i, "");
  const m = /^(\d+(?:\.\d+)?(?:\s*[¼½¾⅓⅔])?|[¼½¾⅓⅔])(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*(.*)$/i.exec(s.trim());
  if (!m) return { qty: null, unit: null };
  const q = parseQuantity(m[1]);
  const qty = q.ok && q.quantity !== null && q.quantity <= MAX_QUANTITY ? q.quantity : null;
  const word = m[2].replace(/\([^)]*\)/g, "").replace(/[^a-z\s-]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 50);
  return { qty, unit: word ? word.toLowerCase() : serves && qty !== null ? "servings" : null };
}

/** The first oven temperature mentioned in the method ("350°F", "180 °C", "350 degrees"). */
export function ovenTempFromSteps(steps: readonly string[]): number | null {
  for (const step of steps) {
    const m = /(\d{3})\s*(?:°|º|degrees?|deg\.?)\s*(f|c|fahrenheit|celsius)?\b/i.exec(step) ?? /(\d{3})\s*(f|c)\b/i.exec(step);
    if (!m) continue;
    const n = Number(m[1]);
    const unit = (m[2] ?? (n > 260 ? "f" : "c")).toLowerCase()[0];
    const c = unit === "f" ? fahrenheitToC(n) : n;
    if (c >= 90 && c <= 300) return c;
  }
  return null;
}

const MAX_SECTIONS = 20;
const MAX_LINES = 100;
const MAX_STEPS = 100;

export function toImportDraft(x: ExtractedRecipe): ImportDraft {
  // consecutive lines with the same section form one group
  const groups: { title: string | null; lines: ParsedLine[] }[] = [];
  for (const ing of x.ingredients) {
    const last = groups[groups.length - 1];
    if (!last || last.title !== ing.section) groups.push({ title: ing.section, lines: [] });
    groups[groups.length - 1].lines.push(parseLine(ing.text));
  }
  const kept = groups.slice(0, MAX_SECTIONS).map((g) => ({ ...g, lines: g.lines.slice(0, MAX_LINES) }));
  if (kept.length === 0) kept.push({ title: null, lines: [] });
  // more than one section: each needs a title (recipeDraftSchema)
  if (kept.length > 1) kept.forEach((g, i) => (g.title ??= i === 0 ? "Ingredients" : `Part ${i + 1}`));

  const y = parseYield(x.yieldText);
  const steps = x.steps.slice(0, MAX_STEPS).map((body) => ({ body: body.slice(0, 5000) }));

  const draft: RecipeDraft = {
    title: (x.title ?? "").slice(0, 200).trim() || "Imported recipe",
    description: x.description ? x.description.slice(0, 2000) : null,
    yieldQty: y.qty,
    yieldUnit: y.unit,
    panId: null,
    prepMin: x.prepMin,
    cookMin: x.cookMin,
    ovenTempC: ovenTempFromSteps(x.steps),
    sections: kept.map((g) => ({
      title: g.title ? g.title.slice(0, 100) : null,
      ingredients: g.lines.map((p) => ({
        ...p.fields,
        ingredientId: null,
        scalingRule: null,
        rawText: p.raw.trim().slice(0, 500) || null,
        parseConfidence: p.confidence,
      })),
    })),
    steps,
  };
  return {
    draft,
    parsed: kept.map((g) => g.lines),
    source: { method: x.method, url: x.url, siteName: x.siteName, imageUrl: x.imageUrl },
  };
}

/** What the reviewer did: "si-li" keys for ingredient lines, indexes for steps. */
export interface ReviewChoices {
  accepted: ReadonlySet<string>;
  removedLines: ReadonlySet<string>;
  removedSteps: ReadonlySet<number>;
}

export const lineKey = (si: number, li: number) => `${si}-${li}`;

/**
 * The draft to save after review: removed lines and steps left out, accepted lines
 * marked checked (confidence 1). A section left empty goes, unless it's the last one;
 * one section left on its own drops the title it only needed to tell sections apart.
 */
export function reviewedDraft(draft: RecipeDraft, c: ReviewChoices): RecipeDraft {
  const sections = draft.sections
    .map((s, si) => ({
      ...s,
      ingredients: s.ingredients
        .map((l, li) => ({ l, key: lineKey(si, li) }))
        .filter(({ key }) => !c.removedLines.has(key))
        .map(({ l, key }) => (c.accepted.has(key) ? { ...l, parseConfidence: 1 } : l)),
    }))
    .filter((s) => s.ingredients.length > 0);
  if (sections.length === 1 && draft.sections.length > 1 && sections[0].title === "Ingredients") sections[0].title = null;
  return {
    ...draft,
    sections: sections.length ? sections : [{ title: null, ingredients: [] }],
    steps: draft.steps.filter((_, i) => !c.removedSteps.has(i)),
  };
}
