import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findUnit, fromBase, isUnitCode, toBase, UNIT_CODES, UNITS } from "./units";

describe("UNIT_CODES vs the database", () => {
  it("matches the unit_code CHECK in the init migration exactly", () => {
    const dir = join(__dirname, "../../supabase/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_init_schema.sql"));
    expect(file).toBeDefined();
    const sql = readFileSync(join(dir, file!), "utf8");
    const m = sql.match(/unit_code\s+text\s+check\s*\(\s*unit_code\s+in\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    const dbCodes = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(dbCodes).toEqual([...UNIT_CODES]);
  });
});

describe("UNITS", () => {
  it("matches the doc §5 base values", () => {
    expect(UNITS.tsp.toBase).toBeCloseTo(4.929, 3);
    expect(UNITS.tbsp.toBase).toBeCloseTo(14.787, 3);
    expect(UNITS.fl_oz.toBase).toBeCloseTo(29.574, 3);
    expect(UNITS.cup.toBase).toBeCloseTo(236.588, 3);
    expect(UNITS.pint.toBase).toBeCloseTo(473.18, 2);
    expect(UNITS.quart.toBase).toBeCloseTo(946.35, 2);
    expect(UNITS.oz.toBase).toBeCloseTo(28.3495, 4);
    expect(UNITS.lb.toBase).toBeCloseTo(453.592, 3);
  });

  it("keeps US volume ratios exact: 1 cup = 16 tbsp = 48 tsp", () => {
    expect(toBase(16, "tbsp")).toBeCloseTo(toBase(1, "cup"), 10);
    expect(toBase(48, "tsp")).toBeCloseTo(toBase(1, "cup"), 10);
    expect(fromBase(toBase(1, "lb"), "oz")).toBeCloseTo(16, 10);
  });

  it("every unit's code is its key", () => {
    for (const code of UNIT_CODES) expect(UNITS[code].code).toBe(code);
  });
});

describe("findUnit", () => {
  it.each([
    ["t", "tsp"], ["T", "tbsp"], ["tsp", "tsp"], ["Tbsp", "tbsp"], ["tablespoons", "tbsp"],
    ["C", "cup"], ["cups", "cup"], [" Cups ", "cup"], ["L", "l"], ["ml", "ml"], ["mL", "ml"],
    ["lbs", "lb"], ["Ounces", "oz"], ["fl oz", "fl_oz"], ["grams", "g"],
  ])("%s → %s", (alias, code) => {
    expect(findUnit(alias)?.code).toBe(code);
  });

  it("returns undefined for unknown units", () => {
    expect(findUnit("handful")).toBeUndefined();
    expect(findUnit("")).toBeUndefined();
  });
});

it("isUnitCode", () => {
  expect(isUnitCode("cup")).toBe(true);
  expect(isUnitCode("cups")).toBe(false);
});
