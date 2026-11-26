// Pasted recipe text → the same shape the page extractor produces, so both go
// through one review screen (doc §1: "send the pasted text through the same
// parser path"). Pure.
import { withSections, type ExtractedRecipe } from "./extract";

const INGREDIENTS_HEADING = /^(?:ingredients?|what you(?:'|’)?ll need|you(?:'|’)?ll need)\s*:?$/i;
const STEPS_HEADING = /^(?:method|directions?|instructions?|preparation|steps|how to make it)\s*:?$/i;
const SUB_HEADING = /^(?:for (?:the )?[a-z][^:]{1,40}|[a-z][a-z ]{1,30}):$/i;
/** "Serves 8", "Servings: 8 slices", or the label alone with its value on the next line */
const YIELD_LABEL = /^(?:serves|makes|yields?|servings?|portions?)\b\s*:?\s*(.*)$/i;
/** "Prep Time 15 mins", "Cook: 1 hr", "Total time" (value on the next line). Without "time"
 *  or a colon, the rest must be only a duration, so "Cook the onions" stays a step. */
const TIME_LABEL =
  /^(prep(?:aration)?|cook(?:ing)?|bak(?:e|ing)|total|active|hands[- ]on|inactive|rest(?:ing)?|chill(?:ing)?|additional|ready in)(\s*time)?\s*(:)?\s*(.*)$/i;
const DURATION =
  /^(?:(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\.?)?\s*(?:,|and)?\s*(?:(\d+)\s*(?:m|mins?|minutes?)\.?)?$/i;
const AMOUNT_START = /^\s*(?:[-–•*▢]\s*)?(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|a\s+(?:pinch|dash|handful)\b|pinch\b|dash\b|zest\b|juice\b)/i;
const STEP_NUMBER = /^\s*(?:step\s*)?\d+[.)]\s+|^\s*step\s*\d+\s*:?\s*/i;

/** "15 mins", "1 hr 5 mins", "1 hour and 30 minutes" → minutes; null when the line is anything else. */
export function durationMinutes(text: string): number | null {
  const m = DURATION.exec(text.trim());
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const total = Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  return total > 0 && total <= 10_000 ? total : null;
}

type Meta = { kind: "yield"; label: string } | { kind: "prep" | "cook" | "other" };

/** A yield or time label, with its value when it's on the same line. */
function metaLine(line: string): { meta: Meta; value: string } | null {
  if (line.length > 60) return null;
  const t = TIME_LABEL.exec(line);
  if (t && (t[2] || t[3] || durationMinutes(t[4]) !== null)) {
    const word = t[1].toLowerCase();
    const kind = word.startsWith("prep") ? "prep" : /^(cook|bak)/.test(word) ? "cook" : "other";
    return { meta: { kind }, value: t[4] };
  }
  const y = YIELD_LABEL.exec(line);
  if (y && (y[1] === "" || /^[\d¼½¾⅓⅔]/.test(y[1]) || line.includes(":"))) {
    return { meta: { kind: "yield", label: line.slice(0, line.length - y[1].length).replace(/:?\s*$/, "") }, value: y[1] };
  }
  return null;
}

/** A short line starting with an amount reads as an ingredient. */
function looksLikeIngredient(line: string): boolean {
  return AMOUNT_START.test(line) && !STEP_NUMBER.test(line) && line.length <= 120;
}

export function parsePaste(text: string): ExtractedRecipe {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  let mode: "start" | "ingredients" | "steps" = "start";
  let title: string | null = null;
  let yieldText: string | null = null;
  let prepMin: number | null = null;
  let cookMin: number | null = null;
  const ingredients: string[] = [];
  const steps: string[] = [];
  /** a label whose value is on the next line ("Prep Time" / "15 mins") */
  let pending: Meta | null = null;

  const setMeta = (meta: Meta, value: string): boolean => {
    if (meta.kind === "yield") {
      if (!/^[\d¼½¾⅓⅔]/.test(value) || value.length > 40) return false;
      // label and value together: parseYield reads "Servings 8" as 8 servings
      yieldText ??= `${meta.label} ${value}`;
      return true;
    }
    const min = durationMinutes(value);
    if (min === null) return false;
    if (meta.kind === "prep") prepMin ??= min;
    if (meta.kind === "cook") cookMin ??= min;
    return true; // total, rest… are read and dropped
  };

  for (const line of lines) {
    if (!line) continue;
    if (pending) {
      const meta = pending;
      pending = null;
      if (setMeta(meta, line)) continue;
    }
    // headings first: "Preparation:" is the method, not a time
    if (INGREDIENTS_HEADING.test(line)) {
      mode = "ingredients";
      continue;
    }
    if (STEPS_HEADING.test(line)) {
      mode = "steps";
      continue;
    }
    const meta = metaLine(line);
    if (meta) {
      if (!meta.value) {
        pending = meta.meta;
        continue;
      }
      if (setMeta(meta.meta, meta.value)) continue;
    }
    if (mode === "start" && title === null && !looksLikeIngredient(line) && line.length <= 100 && !line.endsWith(":")) {
      title = line;
      continue;
    }
    if (mode === "steps") {
      if (SUB_HEADING.test(line)) continue; // "For the glaze:" inside the method
      const step = line.replace(STEP_NUMBER, "").trim();
      if (step) steps.push(step);
      continue;
    }
    if (mode === "ingredients") {
      ingredients.push(line);
      continue;
    }
    // no headings yet: decide line by line
    if (looksLikeIngredient(line) || (SUB_HEADING.test(line) && line.length <= 40)) ingredients.push(line);
    else steps.push(line.replace(STEP_NUMBER, "").trim());
  }

  return {
    method: "paste",
    title,
    description: null,
    ingredients: withSections(ingredients),
    steps,
    yieldText,
    prepMin,
    cookMin,
    imageUrl: null,
    siteName: null,
    url: null,
  };
}
