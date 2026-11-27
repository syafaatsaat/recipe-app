// Extracted recipe → a RecipeDraft for the review screen and the save, plus each
// line's parse (confidence, fix). Pure. Catalog matching happens on the server
// (db/ingredients.ts matchFirst); here every ingredientId is null.
import { MAX_QUANTITY, parseQuantity } from "@/lib/culinary/quantity";
import { fahrenheitToC, type RecipeDraft } from "@/lib/recipes/schema";
import type { ExtractedRecipe } from "./extract";
import { FLAG_BELOW, parseLine, type ParsedLine } from "./parse-line";

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
  return ovenFromSteps(steps)?.c ?? null;
}

/** …and the unit it was written in, so the recipe shows it the same way (doc §3.10). */
export function ovenFromSteps(steps: readonly string[]): { c: number; unit: "F" | "C" } | null {
  for (const step of steps) {
    const m = /(\d{3})\s*(?:°|º|degrees?|deg\.?)\s*(f|c|fahrenheit|celsius)?\b/i.exec(step) ?? /(\d{3})\s*(f|c)\b/i.exec(step);
    if (!m) continue;
    const n = Number(m[1]);
    const unit = (m[2] ?? (n > 260 ? "f" : "c")).toLowerCase()[0];
    const c = unit === "f" ? fahrenheitToC(n) : n;
    if (c >= 90 && c <= 300) return { c, unit: unit === "f" ? "F" : "C" };
  }
  return null;
}

type Line = RecipeDraft["sections"][number]["ingredients"][number];

/** A parsed line as a draft line, within the schema's lengths (a long pasted line still saves). */
export function importedLine(p: ParsedLine, ingredientId: string | null = null): Line {
  const cut = (s: string | null, n: number) => (s ? s.slice(0, n).trim() || null : null);
  return {
    ...p.fields,
    name: p.fields.name.slice(0, 200).trim() || p.raw.trim().slice(0, 200) || "ingredient",
    preparation: cut(p.fields.preparation, 200),
    note: cut(p.fields.note, 500),
    ingredientId,
    scalingRule: null,
    rawText: cut(p.raw.trim(), 500),
    parseConfidence: p.confidence,
  };
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
    const p = parseLine(ing.text);
    const hint = x.lineHints?.[ing.text];
    groups[groups.length - 1].lines.push(hint && p.confidence < FLAG_BELOW ? { ...p, suggestion: hint } : p);
  }
  const kept = groups.slice(0, MAX_SECTIONS).map((g) => ({ ...g, lines: g.lines.slice(0, MAX_LINES) }));
  if (kept.length === 0) kept.push({ title: null, lines: [] });
  // more than one section: each needs a title (recipeDraftSchema)
  if (kept.length > 1) kept.forEach((g, i) => (g.title ??= i === 0 ? "Ingredients" : `Part ${i + 1}`));

  const y = parseYield(x.yieldText);
  const oven = ovenFromSteps(x.steps);
  const steps = x.steps.slice(0, MAX_STEPS).map((body) => ({ body: body.slice(0, 5000), photoId: null }));

  const draft: RecipeDraft = {
    title: (x.title ?? "").slice(0, 200).trim() || "Imported recipe",
    description: x.description ? x.description.slice(0, 2000) : null,
    yieldQty: y.qty,
    yieldUnit: y.unit,
    panId: null,
    prepMin: x.prepMin,
    cookMin: x.cookMin,
    ovenTempC: oven?.c ?? null,
    ovenUnit: oven?.unit ?? null,
    sections: kept.map((g) => ({
      title: g.title ? g.title.slice(0, 100) : null,
      ingredients: g.lines.map((p) => importedLine(p)),
    })),
    steps,
    photos: [],
    coverPhotoId: null,
  };
  return {
    draft,
    parsed: kept.map((g) => g.lines),
    source: { method: x.method, url: x.url, siteName: x.siteName, imageUrl: x.imageUrl },
  };
}

/**
 * What the reviewer did. Ingredient lines are keyed "si-li", steps by index; a moved
 * item keeps its original key, so removing or accepting it works wherever it now sits.
 */
export interface ReviewChoices {
  accepted: ReadonlySet<string>;
  removedLines: ReadonlySet<string>;
  removedSteps: ReadonlySet<number>;
  /** ingredient lines that are really steps */
  movedLines?: ReadonlySet<string>;
  /** steps that are really ingredients */
  movedSteps?: ReadonlySet<number>;
  /** catalog matches found for moved steps, by step index */
  stepMatches?: ReadonlyMap<number, string | null>;
  /** lines whose AI suggestion the reviewer chose ("Use this"), by line key */
  suggested?: ReadonlySet<string>;
  /** catalog matches for those suggestions, by line key */
  suggestionMatches?: ReadonlyMap<string, string | null>;
}

export const lineKey = (si: number, li: number) => `${si}-${li}`;
/** the accept key of a step moved into the ingredients */
export const stepKey = (i: number) => `s${i}`;

/** A step read as an ingredient line. */
export const stepAsLine = (body: string) => parseLine(body);

/**
 * The draft to save after review. Removed lines and steps are left out; accepted lines
 * are marked checked (confidence 1). Lines moved to the method become steps (their
 * original text) after the others; steps moved to the ingredients are parsed and join
 * the last section. A section left empty goes, unless it's the last one; one section
 * left on its own drops the title it only needed to tell sections apart. A line whose
 * AI suggestion was chosen saves the suggestion's fields (`parsed` holds it), checked,
 * keeping the original text.
 */
export function reviewedDraft(draft: RecipeDraft, c: ReviewChoices, parsed?: readonly (readonly ParsedLine[])[]): RecipeDraft {
  const movedLines = c.movedLines ?? new Set<string>();
  const movedSteps = c.movedSteps ?? new Set<number>();
  const check = (l: Line, key: string): Line => (c.accepted.has(key) ? { ...l, parseConfidence: 1 } : l);

  const suggestionOf = (l: Line, key: string, si: number, li: number): Line => {
    const fields = c.suggested?.has(key) ? parsed?.[si]?.[li]?.suggestion : undefined;
    if (!fields) return check(l, key);
    const p: ParsedLine = { raw: l.rawText ?? l.name, fields, confidence: 1, info: [], fix: null };
    return importedLine(p, c.suggestionMatches?.get(key) ?? null);
  };
  const sections = draft.sections.map((s, si) => ({
    ...s,
    ingredients: s.ingredients
      .map((l, li) => ({ l, li, key: lineKey(si, li) }))
      .filter(({ key }) => !c.removedLines.has(key) && !movedLines.has(key))
      .map(({ l, li, key }) => suggestionOf(l, key, si, li)),
  }));
  const fromSteps = [...movedSteps]
    .filter((i) => i < draft.steps.length && !c.removedSteps.has(i))
    .sort((a, b) => a - b)
    .map((i) => check(importedLine(stepAsLine(draft.steps[i].body), c.stepMatches?.get(i) ?? null), stepKey(i)));
  sections[sections.length - 1].ingredients.push(...fromSteps);

  const kept = sections.filter((s) => s.ingredients.length > 0);
  if (kept.length === 1 && draft.sections.length > 1 && kept[0].title === "Ingredients") kept[0].title = null;

  const fromLines = draft.sections.flatMap((s, si) =>
    s.ingredients
      .map((l, li) => ({ l, key: lineKey(si, li) }))
      .filter(({ key }) => movedLines.has(key) && !c.removedLines.has(key))
      .map(({ l }) => ({ body: (l.rawText ?? l.name).slice(0, 5000), photoId: null })),
  );
  return {
    ...draft,
    sections: kept.length ? kept : [{ title: null, ingredients: [] }],
    steps: [...draft.steps.filter((_, i) => !c.removedSteps.has(i) && !movedSteps.has(i)), ...fromLines].slice(0, 100),
  };
}
