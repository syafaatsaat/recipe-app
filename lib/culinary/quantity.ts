// Reading an amount the way people type it in the editor: "1½", "1 1/2", "1-1/2",
// "1.5", "½", ranges "2-3" / "2–3" / "2 to 3". Empty means no amount ("salt to taste").
// The line parser for whole lines ("1 ½ cups flour, sifted") is M5; this is only the
// amount field.
import { formatUSNumber } from "./format";

export type QuantityResult =
  | { ok: true; quantity: number | null; quantityMax: number | null }
  | { ok: false; error: string };

/** Matches the DB column numeric(10,4). */
export const MAX_QUANTITY = 999_999;

const UNICODE_FRACTIONS: Record<string, number> = {
  "⅛": 1 / 8, "¼": 1 / 4, "⅓": 1 / 3, "⅜": 3 / 8, "½": 1 / 2, "⅝": 5 / 8,
  "⅔": 2 / 3, "¾": 3 / 4, "⅞": 7 / 8, "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5, "⅙": 1 / 6, "⅚": 5 / 6,
};
const GLYPH_CLASS = `[${Object.keys(UNICODE_FRACTIONS).join("")}]`;
const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const WITH_GLYPH = new RegExp(`^(?:(\\d+)\\s*)?(${GLYPH_CLASS})$`);
const SLASHED = /^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/;

/** One number, no range. NaN when it isn't one. */
function parseNumber(raw: string): number {
  const s = raw.trim();
  if (DECIMAL.test(s)) return Number(s);
  let m = WITH_GLYPH.exec(s);
  if (m) return Number(m[1] ?? 0) + UNICODE_FRACTIONS[m[2]];
  m = SLASHED.exec(s);
  if (m && Number(m[3]) > 0) return Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  return NaN;
}

/** A fraction with no whole part: "½" or "1/2" (not "1½", "1 1/2" or "0.5"). */
function isPlainFraction(raw: string): boolean {
  const s = raw.trim();
  const glyph = WITH_GLYPH.exec(s);
  if (glyph) return glyph[1] === undefined;
  const slashed = SLASHED.exec(s);
  return slashed !== null && slashed[1] === undefined;
}

export function parseQuantity(text: string): QuantityResult {
  const s = text.trim().replace(/\s+/g, " ");
  if (s === "") return { ok: true, quantity: null, quantityMax: null };

  // "1-1/2" is the US way of writing 1½, not a range from 1 to ½.
  const hyphenMixed = /^(\d+)\s*-\s*(.+)$/.exec(s);
  if (hyphenMixed && isPlainFraction(hyphenMixed[2])) {
    const frac = parseNumber(hyphenMixed[2]);
    if (frac > 0 && frac < 1) return single(Number(hyphenMixed[1]) + frac);
  }

  const range = s.split(/\s*(?:[-–—]|\bto\b)\s*/);
  if (range.length === 2) {
    const [lo, hi] = range.map(parseNumber);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return notANumber();
    if (lo <= 0 || hi <= 0) return { ok: false, error: "Amounts must be more than 0." };
    if (hi > MAX_QUANTITY) return tooBig();
    if (hi < lo) return { ok: false, error: "Put the smaller number first, like 2–3." };
    return hi === lo ? single(lo) : { ok: true, quantity: lo, quantityMax: hi };
  }
  if (range.length > 2) return notANumber();
  return single(parseNumber(s));
}

function single(v: number): QuantityResult {
  if (Number.isNaN(v)) return notANumber();
  if (v <= 0) return { ok: false, error: "Amounts must be more than 0. Leave it empty for “to taste”." };
  if (v > MAX_QUANTITY) return tooBig();
  return { ok: true, quantity: v, quantityMax: null };
}
const notANumber = (): QuantityResult => ({ ok: false, error: "Use a number like 2, 1½, 1 1/2, 0.75 or 2–3." });
const tooBig = (): QuantityResult => ({ ok: false, error: "That amount is too large." });

/** The editor's text for a stored amount: 1.5 → "1½", (2, 3) → "2–3", null → "". */
export function formatQuantity(quantity: number | null, quantityMax: number | null = null): string {
  if (quantity === null) return "";
  const q = formatUSNumber(quantity);
  return quantityMax === null ? q : `${q}–${formatUSNumber(quantityMax)}`;
}
