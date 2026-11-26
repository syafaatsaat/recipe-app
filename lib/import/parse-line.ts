// Ingredient line → structured fields + a confidence score (doc §1 "Ingredient line
// parsing", §3.4, §3.6, §3.9). Pure: no I/O. The importer's review screen flags
// lines below FLAG_BELOW; the raw text is always kept next to the result.
import { parseQuantity } from "@/lib/culinary/quantity";
import { findUnit, type UnitCode } from "@/lib/culinary/units";

export const FLAG_BELOW = 0.8;

export interface ParsedFields {
  quantity: number | null;
  quantityMax: number | null;
  unitCode: UnitCode | null;
  name: string;
  preparation: string | null;
  note: string | null;
  isOptional: boolean;
}

export interface LineFix {
  /** what the parser assumed, in words */
  text: string;
  /** the one-tap button: accepting keeps `fields` (or the alternative) and clears the flag */
  label: string;
  /** a different reading to use instead, when accepting changes the line */
  alternative?: ParsedFields;
}

export interface ParsedLine {
  raw: string;
  fields: ParsedFields;
  /** 0–1; below FLAG_BELOW the review screen highlights the line */
  confidence: number;
  /** information that doesn't need action ("1 stick = 4 oz") */
  info: string[];
  fix: LineFix | null;
  /** an AI reading of a flagged line (doc §3.11), offered on the review, never applied unasked */
  suggestion?: ParsedFields;
}

// ── lexing ───────────────────────────────────────────────────────────────────

const GLYPH = "[¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]";
const ONE = `(?:\\d+\\s*${GLYPH}|\\d+-\\d+\\s*/\\s*\\d+|\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|${GLYPH}|\\d*\\.\\d+|\\d+)`;
const AMOUNT = new RegExp(`^(${ONE}(?:\\s*(?:-|–|—|to)\\s*${ONE})?)(?![\\d/])`, "i");
const PAREN_START = /^\(([^)]*)\)\s*/;
const STICK = /^sticks?\b\.?\s*/i;
const BUTTERY = /\b(butter|margarine)\b/i;
/** "a pinch of", "2 dashes", "handful" (§3.9: no amount, the word goes to the note) */
const PINCH = /^(?:(a|an|one|\d+)\s+)?(pinch(?:es)?|dash(?:es)?|smidgen|sprinkle|handful|splash)\s+(?:of\s+)?/i;
const NO_AMOUNT_PHRASE = /[,(]?\s*\b(to taste|as needed|as required|if needed|for serving|for garnish|to serve|for the top|for dusting)\b\)?/i;
const OPTIONAL = /\s*(?:,\s*optional\b|\(\s*optional\s*\)|^optional:?\s*)/i;
const ZEST_JUICE = /^(zest and juice|juice and zest|zest|juice)\s+of\s+/i;
/** count words that look like a unit but aren't one: stay in the name ("2 cans tomatoes") */
const PACKAGE = /^(cans?|tins?|packages?|pkgs?\.?|packets?|jars?|envelopes?|bags?|boxes|box|containers?|bottles?|cartons?)\b/i;

const clean = (s: string) =>
  s
    .replace(/[   ]/g, " ")
    .replace(/⁄/g, "/")
    .replace(/^\s*(?:[-–•*▢□☐]|\d+\)\s)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

const tidy = (s: string) =>
  s
    .replace(/\s+,/g, ",")
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Splits "name, preparation (note)" into its parts. */
function splitRest(rest: string): { name: string; preparation: string | null; notes: string[] } {
  const notes: string[] = [];
  let s = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return " ";
  });
  s = tidy(s);
  const comma = s.indexOf(",");
  const name = tidy(comma === -1 ? s : s.slice(0, comma));
  const preparation = comma === -1 ? null : tidy(s.slice(comma + 1)) || null;
  return { name, preparation, notes };
}

/** Reads a unit word (or two, for "fl oz") at the start of `s`. */
function readUnit(s: string): { code: UnitCode; length: number } | null {
  const two = /^([a-z.]+\s+[a-z.]+)\b\.?/i.exec(s);
  if (two) {
    const u = findUnit(two[1]);
    if (u) return { code: u.code, length: two[0].length };
  }
  const one = /^([a-z]+)\.?(?![a-z-])/i.exec(s);
  if (one) {
    const u = findUnit(one[1]) ?? findUnit(`${one[1]}.`);
    if (u) return { code: u.code, length: one[0].length };
  }
  return null;
}

// ── parsing ──────────────────────────────────────────────────────────────────

export function parseLine(input: string): ParsedLine {
  const raw = input;
  let s = clean(input);
  const info: string[] = [];
  const notes: string[] = [];
  let confidence = 0.97;
  let fix: LineFix | null = null;

  let isOptional = false;
  if (OPTIONAL.test(s)) {
    isOptional = true;
    s = tidy(s.replace(OPTIONAL, " "));
  }

  // "Zest of 2 lemons" → 2 lemons, zested (a guess the user confirms)
  let zestPrep: string | null = null;
  const zest = ZEST_JUICE.exec(s);
  if (zest) {
    const w = zest[1].toLowerCase();
    zestPrep = w === "zest" ? "zested" : w === "juice" ? "juiced" : "zested and juiced";
    s = s.slice(zest[0].length);
  }

  // a pinch, a dash… (§3.9)
  const pinch = PINCH.exec(s);
  if (pinch) {
    const count = pinch[1] && /^\d+$/.test(pinch[1]) ? `${pinch[1]} ` : "";
    notes.push(`${count}${pinch[2].toLowerCase()}`);
    s = s.slice(pinch[0].length);
    const rest = splitRest(s);
    return result(raw, { quantity: null, quantityMax: null, unitCode: null, ...rest, notes: [...notes, ...rest.notes], isOptional }, 0.9, info, null);
  }

  // amount
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  const amount = AMOUNT.exec(s);
  if (amount) {
    const q = parseQuantity(amount[1]);
    if (q.ok) {
      quantity = q.quantity;
      quantityMax = q.quantityMax;
    } else {
      confidence = Math.min(confidence, 0.4);
      notes.push(amount[1]);
    }
    s = s.slice(amount[0].length).trimStart();
  }

  // a size in brackets straight after the amount: "2 (14 oz) cans", "1 (210g)"
  const sizeParen = quantity !== null ? PAREN_START.exec(s) : null;
  if (sizeParen) {
    notes.push(sizeParen[1].trim());
    s = s.slice(sizeParen[0].length);
  }

  // unit
  let unitCode: UnitCode | null = null;
  if (quantity !== null) {
    const unit = readUnit(s);
    if (unit) {
      unitCode = unit.code;
      s = s.slice(unit.length).trimStart();
    } else if (STICK.test(s)) {
      if (BUTTERY.test(s)) {
        // §3.6: a US stick of butter is 4 oz, converted at parse time
        info.push(`${quantity === 1 && quantityMax === null ? "1 stick" : "A stick"} = 4 oz`);
        quantity *= 4;
        if (quantityMax !== null) quantityMax *= 4;
        unitCode = "oz";
        s = s.replace(STICK, "");
      } else {
        confidence = Math.min(confidence, 0.5);
        fix = { text: "“stick” isn’t a unit we use, so it stays part of the name.", label: "Keep as written" };
      }
    } else if (PACKAGE.test(s)) {
      // "2 cans tomatoes" counts cans; its size, if given, is in the note
      confidence = Math.min(confidence, sizeParen ? 0.7 : 0.85);
      if (sizeParen) {
        fix = { text: `Counted in ${PACKAGE.exec(s)![1].toLowerCase()} of ${sizeParen[1].trim()}.`, label: "Looks right" };
      }
    }
    // "1 cup (120 g) flour", "2 cups of flour"
    const afterUnit = unitCode ? PAREN_START.exec(s) : null;
    if (afterUnit) {
      notes.push(afterUnit[1].trim());
      s = s.slice(afterUnit[0].length);
    }
    s = s.replace(/^of\s+/i, "");
  }

  // no amount: "to taste", "for serving", or nothing at all
  if (quantity === null) {
    const phrase = NO_AMOUNT_PHRASE.exec(s);
    if (phrase) {
      s = tidy(s.replace(NO_AMOUNT_PHRASE, ""));
      const rest = splitRest(s);
      const phraseText = phrase[1].toLowerCase();
      const isTaste = /taste|needed|required/.test(phraseText);
      return result(
        raw,
        {
          quantity: null, quantityMax: null, unitCode: null,
          name: rest.name,
          preparation: isTaste ? rest.preparation : [rest.preparation, phraseText].filter(Boolean).join(", ") || null,
          notes: [...notes, ...(isTaste ? [phraseText] : []), ...rest.notes],
          isOptional,
        },
        0.92, info, null,
      );
    }
    if (!zest) {
      confidence = Math.min(confidence, 0.7);
      fix = { text: "No amount found, so it’s kept like “to taste”.", label: "Keep" };
    }
  }

  const rest = splitRest(s);
  notes.push(...rest.notes);
  let preparation = rest.preparation;
  if (zestPrep) {
    preparation = [zestPrep, preparation].filter(Boolean).join(", ");
    confidence = Math.min(confidence, 0.6);
    const amt = quantity !== null ? `${formatShort(quantity)} ` : "";
    fix = { text: `Read as ${amt}${rest.name}, ${zestPrep}. Is that right?`, label: "Looks right" };
  }

  // things the parser couldn't place
  if (!rest.name) confidence = Math.min(confidence, 0.2);
  if (/\d/.test(rest.name)) confidence = Math.min(confidence, 0.6);
  if (/\b(or)\b/i.test(rest.name)) confidence = Math.min(confidence, 0.85);
  if (rest.name.length > 60) confidence = Math.min(confidence, 0.7);
  if (confidence < FLAG_BELOW && !fix) fix = { text: "Check this line against the original.", label: "Keep as read" };

  return result(raw, { quantity, quantityMax, unitCode, name: rest.name || clean(raw), preparation, notes, isOptional }, confidence, info, fix);
}

function formatShort(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function result(
  raw: string,
  f: Omit<ParsedFields, "note" | "name" | "preparation"> & { name: string; preparation: string | null; notes: string[] },
  confidence: number,
  info: string[],
  fix: LineFix | null,
): ParsedLine {
  const name = f.name.slice(0, 200) || "ingredient";
  const note = f.notes.length ? f.notes.join("; ").slice(0, 500) : null;
  return {
    raw,
    fields: {
      quantity: f.quantity,
      quantityMax: f.quantityMax,
      unitCode: f.unitCode,
      name,
      preparation: f.preparation ? f.preparation.slice(0, 200) : null,
      note,
      isOptional: f.isOptional,
    },
    confidence: Math.round(confidence * 100) / 100,
    info,
    fix: confidence < FLAG_BELOW ? fix : null,
  };
}

// ── matching help ────────────────────────────────────────────────────────────

const DESCRIPTORS = new Set([
  "large", "medium", "small", "extra-large", "jumbo", "fresh", "freshly", "packed", "lightly",
  "firmly", "good", "quality", "good-quality", "whole", "organic", "cold", "warm", "room-temperature", "softened",
]);

function singular(w: string): string {
  if (/ies$/.test(w)) return w.replace(/ies$/, "y");
  if (/(ches|shes|oes|xes)$/.test(w)) return w.replace(/es$/, "");
  if (/(ss|us|is)$/.test(w) || /sses$/.test(w)) return w; // molasses, couscous, hummus, glass
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

/**
 * Names to try against the catalog, most specific first: "Extra-virgin olive oil"
 * → "extra-virgin olive oil", "extra virgin olive oil", "virgin olive oil", "olive oil", "oil"…
 */
export function ingredientCandidates(name: string): string[] {
  const base = name.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  const variants = [base, base.replace(/-/g, " ")];
  for (const v of variants) add(v);
  for (const v of variants) {
    const words = v.split(" ").filter((w) => !DESCRIPTORS.has(w));
    add(words.join(" "));
    for (let i = 1; i < words.length; i++) add(words.slice(i).join(" "));
  }
  for (const c of [...out]) {
    const words = c.split(" ");
    add([...words.slice(0, -1), singular(words[words.length - 1])].join(" "));
  }
  return out;
}
