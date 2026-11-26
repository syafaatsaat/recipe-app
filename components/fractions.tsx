// Fractions drawn the same way everywhere: a raised numerator, a slash and the
// denominator, in the surrounding digits. DM Mono's own ¼ ½ ¾ are tiny stacked glyphs
// and ⅓ ⅛ fall back to another font. The fraction character stays in the text (visually
// hidden), so copying, screen readers and getByText still see "1½ cups".
const GLYPHS: Record<string, readonly [string, string]> = {
  "¼": ["1", "4"], "½": ["1", "2"], "¾": ["3", "4"], "⅓": ["1", "3"], "⅔": ["2", "3"],
  "⅛": ["1", "8"], "⅜": ["3", "8"], "⅝": ["5", "8"], "⅞": ["7", "8"], "⅕": ["1", "5"],
  "⅖": ["2", "5"], "⅗": ["3", "5"], "⅘": ["4", "5"], "⅙": ["1", "6"], "⅚": ["5", "6"],
};
const SPLIT = /([¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])/;

export function Fractions({ text }: { text: string }) {
  if (!SPLIT.test(text)) return text;
  const parts = text.split(SPLIT);
  return parts.map((part, i) => {
    const f = GLYPHS[part];
    if (!f) return part;
    // "1¾": a little air between the whole number and the fraction
    const mixed = /\d$/.test(parts[i - 1] ?? "");
    return (
      <span key={i} className={mixed ? "frac frac-mixed" : "frac"} data-n={f[0]} data-d={f[1]}>
        <span className="frac-glyph">{part}</span>
      </span>
    );
  });
}
