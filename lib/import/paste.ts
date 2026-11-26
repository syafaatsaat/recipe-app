// Pasted recipe text → the same shape the page extractor produces, so both go
// through one review screen (doc §1: "send the pasted text through the same
// parser path"). Pure.
import { withSections, type ExtractedRecipe } from "./extract";

const INGREDIENTS_HEADING = /^(?:ingredients?|what you(?:'|’)?ll need|you(?:'|’)?ll need)\s*:?$/i;
const STEPS_HEADING = /^(?:method|directions?|instructions?|preparation|steps|how to make it)\s*:?$/i;
const SUB_HEADING = /^(?:for (?:the )?[a-z][^:]{1,40}|[a-z][a-z ]{1,30}):$/i;
const YIELD_LINE = /^(?:serves|makes|yield|yields|servings)\b:?\s*(.+)$/i;
const AMOUNT_START = /^\s*(?:[-–•*▢]\s*)?(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|a\s+(?:pinch|dash|handful)\b|pinch\b|dash\b|zest\b|juice\b)/i;
const STEP_NUMBER = /^\s*(?:step\s*)?\d+[.)]\s+|^\s*step\s*\d+\s*:?\s*/i;

/** A short line starting with an amount reads as an ingredient. */
function looksLikeIngredient(line: string): boolean {
  return AMOUNT_START.test(line) && !STEP_NUMBER.test(line) && line.length <= 120;
}

export function parsePaste(text: string): ExtractedRecipe {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  let mode: "start" | "ingredients" | "steps" = "start";
  let title: string | null = null;
  let yieldText: string | null = null;
  const ingredients: string[] = [];
  const steps: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (INGREDIENTS_HEADING.test(line)) {
      mode = "ingredients";
      continue;
    }
    if (STEPS_HEADING.test(line)) {
      mode = "steps";
      continue;
    }
    const y = YIELD_LINE.exec(line);
    if (y && !yieldText && line.length <= 60) {
      yieldText = line.trim(); // whole line: parseYield reads "Serves 8" as 8 servings
      continue;
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
    prepMin: null,
    cookMin: null,
    imageUrl: null,
    siteName: null,
    url: null,
  };
}
