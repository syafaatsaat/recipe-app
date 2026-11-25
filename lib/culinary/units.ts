// Unit definitions. Base units: ml (volume), g (mass). Counts have no unit (unit_code null).
// UNIT_CODES must match the unit_code CHECK in supabase/migrations/*_init_schema.sql
// (units.test.ts enforces it).

export type Dimension = "volume" | "mass" | "count";
export type UnitSystem = "us" | "metric";

export const UNIT_CODES = [
  "tsp", "tbsp", "fl_oz", "cup", "pint", "quart",
  "ml", "l", "g", "kg", "oz", "lb",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];

export interface UnitDef {
  code: UnitCode;
  dimension: Exclude<Dimension, "count">;
  /** amount of base unit (ml or g) in one of this unit */
  toBase: number;
  system: UnitSystem;
  aliases: readonly string[];
}

// US customary volumes are derived from the cup so ratios are exact (1 cup = 16 tbsp = 48 tsp).
const CUP_ML = 236.5882365;

export const UNITS: Readonly<Record<UnitCode, UnitDef>> = {
  tsp:   { code: "tsp",   dimension: "volume", toBase: CUP_ML / 48, system: "us",     aliases: ["t", "tsp.", "tsps", "teaspoon", "teaspoons"] },
  tbsp:  { code: "tbsp",  dimension: "volume", toBase: CUP_ML / 16, system: "us",     aliases: ["T", "tbs", "tbsp.", "tbsps", "tablespoon", "tablespoons"] },
  fl_oz: { code: "fl_oz", dimension: "volume", toBase: CUP_ML / 8,  system: "us",     aliases: ["fl oz", "fl. oz.", "fluid ounce", "fluid ounces"] },
  cup:   { code: "cup",   dimension: "volume", toBase: CUP_ML,      system: "us",     aliases: ["c", "c.", "cups"] },
  pint:  { code: "pint",  dimension: "volume", toBase: CUP_ML * 2,  system: "us",     aliases: ["pt", "pints"] },
  quart: { code: "quart", dimension: "volume", toBase: CUP_ML * 4,  system: "us",     aliases: ["qt", "quarts"] },
  ml:    { code: "ml",    dimension: "volume", toBase: 1,           system: "metric", aliases: ["mL", "milliliter", "milliliters", "millilitre", "millilitres"] },
  l:     { code: "l",     dimension: "volume", toBase: 1000,        system: "metric", aliases: ["L", "liter", "liters", "litre", "litres"] },
  g:     { code: "g",     dimension: "mass",   toBase: 1,           system: "metric", aliases: ["gram", "grams", "gr"] },
  kg:    { code: "kg",    dimension: "mass",   toBase: 1000,        system: "metric", aliases: ["kilogram", "kilograms", "kilo", "kilos"] },
  oz:    { code: "oz",    dimension: "mass",   toBase: 28.349523125, system: "us",    aliases: ["ounce", "ounces"] },
  lb:    { code: "lb",    dimension: "mass",   toBase: 453.59237,   system: "us",     aliases: ["lbs", "pound", "pounds"] },
};

const CASE_SENSITIVE = new Map<string, UnitCode>([["t", "tsp"], ["T", "tbsp"]]);
const BY_ALIAS = new Map<string, UnitCode>();
for (const u of Object.values(UNITS)) {
  for (const a of [u.code, ...u.aliases]) {
    if (!CASE_SENSITIVE.has(a)) BY_ALIAS.set(a.toLowerCase(), u.code);
  }
}

/** Look up a unit by code or alias. "t" = tsp and "T" = tbsp are case-sensitive; everything else is not. */
export function findUnit(text: string): UnitDef | undefined {
  const s = text.trim();
  const code = CASE_SENSITIVE.get(s) ?? BY_ALIAS.get(s.toLowerCase());
  return code ? UNITS[code] : undefined;
}

export function isUnitCode(s: string): s is UnitCode {
  return (UNIT_CODES as readonly string[]).includes(s);
}

export const toBase = (qty: number, unit: UnitCode): number => qty * UNITS[unit].toBase;
export const fromBase = (base: number, unit: UnitCode): number => base / UNITS[unit].toBase;
