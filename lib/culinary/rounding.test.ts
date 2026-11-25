import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  floorUS, metricPart, roundHalf, roundMetric, snapCount, snapUS, splitEggs, usParts,
  US_MASS_LADDER, US_VOLUME_LADDER, type Part,
} from "./rounding";
import { toBase, UNITS, type UnitCode } from "./units";

const tsp = (n: number) => toBase(n, "tsp");
const tbsp = (n: number) => toBase(n, "tbsp");
const cup = (n: number) => toBase(n, "cup");
const oz = (n: number) => toBase(n, "oz");

describe("snapUS (rule 1)", () => {
  it.each([
    [0.375, 1 / 3],   // ⅜ is not allowed: ⅓ is nearer than ½
    [1.9, 2],         // .9 is nearer 1 than ¾
    [2.29, 2.25],     // ¼ (.04 away) beats ⅓ (.043 away)
    [0.07, 1 / 8],
    [0.06, 0],
    [0.0625, 0],      // exact tie between 0 and ⅛ → smaller
    [0.6, 2 / 3],
    [3, 3],
  ])("%d → %d", (v, expected) => {
    expect(snapUS(v)).toBeCloseTo(expected, 10);
  });
});

describe("floorUS", () => {
  it.each([[0.375, 1 / 3], [0.7, 2 / 3], [0.99, 0.75], [1, 1], [2.13, 2.125], [0.1, 0]])("%d → %d", (v, e) => {
    expect(floorUS(v)).toBeCloseTo(e, 10);
  });
});

describe("roundMetric (rule 4): step from the unrounded value", () => {
  it.each([
    [9.74, 9.5], [9.9, 10],     // < 10: 0.5 steps
    [10.4, 10], [99.9, 100],    // < 100: 1 steps
    [100, 100], [102.4, 100], [102.5, 105], [999, 1000], // < 1000: 5 steps
    [1004, 1000], [1005, 1010], // ≥ 1000: 10 steps
    [0.2, 0],
  ])("%d → %d", (v, e) => {
    expect(roundMetric(v)).toBe(e);
  });
});

describe("metricPart", () => {
  it("1 cup = 236.588 ml → 235 ml", () => {
    expect(metricPart(cup(1), "volume")).toEqual({ kind: "qty", value: 235, unit: "ml" });
  });
  it("switches to kg/L at 1000", () => {
    expect(metricPart(999, "mass")).toEqual({ kind: "qty", value: 1, unit: "kg" });
    expect(metricPart(1250, "mass")).toEqual({ kind: "qty", value: 1.25, unit: "kg" });
    expect(metricPart(1500, "volume")).toEqual({ kind: "qty", value: 1.5, unit: "l" });
  });
  it("tiny amounts are <0.5, never 0 (rule 8)", () => {
    expect(metricPart(0.2, "mass")).toEqual({ kind: "lt_half", unit: "g" });
    expect(metricPart(0.2, "volume")).toEqual({ kind: "lt_half", unit: "ml" });
  });
});

const q = (value: number, unit: UnitCode): Part => ({ kind: "qty", value, unit });

describe("usParts: volume ladder (rules 2 and 5)", () => {
  it("doc: 0.0625 cup → 1 tbsp", () => {
    expect(usParts(cup(0.0625), US_VOLUME_LADDER)).toEqual([q(1, "tbsp")]);
  });

  it("doc: 18 tsp → ⅓ cup + 2 tsp", () => {
    const parts = usParts(tsp(18), US_VOLUME_LADDER);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ unit: "cup" });
    expect((parts[0] as { value: number }).value).toBeCloseTo(1 / 3, 10);
    expect(parts[1]).toMatchObject({ unit: "tsp" });
    expect((parts[1] as { value: number }).value).toBeCloseTo(2, 10);
  });

  it("snaps before picking: 2.95 tsp → 3 tsp → 1 tbsp", () => {
    expect(usParts(tsp(2.95), US_VOLUME_LADDER)).toEqual([q(1, "tbsp")]);
  });

  it("stays in tsp below 1 tbsp", () => {
    expect(usParts(tsp(2.5), US_VOLUME_LADDER)).toEqual([q(2.5, "tsp")]);
  });

  it("¼ cup boundary: 4 tbsp → ¼ cup; 3.9 tbsp snaps to 4 → ¼ cup; 3.8 tbsp → 3¾ tbsp", () => {
    expect(usParts(tbsp(4), US_VOLUME_LADDER)).toEqual([q(0.25, "cup")]);
    expect(usParts(tbsp(3.9), US_VOLUME_LADDER)).toEqual([q(0.25, "cup")]);
    expect(usParts(tbsp(3.8), US_VOLUME_LADDER)).toEqual([q(3.75, "tbsp")]);
  });

  it("5% threshold: 1.05 cups (4.8% off) stays one part; 1.06 cups (5.7% off) splits", () => {
    expect(usParts(cup(1.05), US_VOLUME_LADDER)).toEqual([q(1, "cup")]);
    // remainder 0.06 cup = 0.96 tbsp = 2.88 tsp → snaps to 3 tsp → 1 tbsp
    expect(usParts(cup(1.06), US_VOLUME_LADDER)).toEqual([q(1, "cup"), q(1, "tbsp")]);
  });

  it("never splits on the smallest rung, even above 5%: 1.875 tsp → 1¾ tsp", () => {
    expect(usParts(tsp(1.875), US_VOLUME_LADDER)).toEqual([q(1.75, "tsp")]);
  });

  it("allowTwoPart=false keeps one part", () => {
    const [p, ...rest] = usParts(tsp(18), US_VOLUME_LADDER, false);
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ unit: "cup" });
  });

  it("tiny amounts are a pinch, never 0 (rule 8)", () => {
    expect(usParts(tsp(0.05), US_VOLUME_LADDER)).toEqual([{ kind: "pinch" }]);
  });

  it("the second part snaps to whole or ½ units only (rule 5)", () => {
    // ½ cup flour × 1.839 (9 in round → 9×13) = 0.9196 cup: ¾ cup + 2.71 tbsp → 2½ tbsp, not 2¾
    expect(usParts(cup(0.5 * 1.83912), US_VOLUME_LADDER)).toEqual([q(0.75, "cup"), q(2.5, "tbsp")]);
    // 0.86 cup: ¾ cup + 1.76 tbsp → 2 tbsp
    expect(usParts(cup(0.86), US_VOLUME_LADDER)).toEqual([q(0.75, "cup"), q(2, "tbsp")]);
    // a remainder below 1 tbsp goes to tsp: 0.306 cup → ¼ cup + 2.7 tsp → 2½ tsp
    expect(usParts(cup(0.30625), US_VOLUME_LADDER)).toEqual([q(0.25, "cup"), q(2.5, "tsp")]);
  });

  it("a remainder that snaps to 0 is dropped, keeping the single snapped amount", () => {
    // 1.07 tbsp → 1⅛ tbsp (5.1% off) → split: 1 tbsp + 0.21 tsp → ½-snap 0 → keep 1⅛ tbsp
    expect(usParts(tbsp(1.07), US_VOLUME_LADDER)).toEqual([q(1.125, "tbsp")]);
  });

  it("keeps one part when the remainder rounds away", () => {
    // 1.2 tbsp: snaps 1¼ (4% off) → one part anyway
    expect(usParts(tbsp(1.2), US_VOLUME_LADDER)).toEqual([q(1.25, "tbsp")]);
  });
});

describe("usParts: mass ladder (rule 3)", () => {
  it("oz below 1 lb", () => {
    expect(usParts(oz(12), US_MASS_LADDER)).toEqual([q(12, "oz")]);
  });
  it("20 oz → 1¼ lb", () => {
    expect(usParts(oz(20), US_MASS_LADDER)).toEqual([q(1.25, "lb")]);
  });
  it("17 oz → 1 lb + 1 oz (1 lb alone is 5.9% off)", () => {
    expect(usParts(oz(17), US_MASS_LADDER)).toEqual([q(1, "lb"), q(1, "oz")]);
  });
});

describe("splitEggs (rule 6)", () => {
  it.each([
    [2.5, 2, 0.5],
    [2.24, 2, 0], [2.25, 2, 0.25], [2.75, 2, 0.75], [2.76, 3, 0],
    [0.2, 0, 0.2],   // never "0 eggs": below ¼ → beaten only
    [0.5, 0, 0.5],
    [0.8, 1, 0],
    [3, 3, 0],
    [2.68, 2, 0.68], // fewer than 3 whole eggs: beaten remainder still shown
    // 3 or more whole eggs: always the nearest whole egg
    [3.4, 3, 0], [3.5, 4, 0], [3.68, 4, 0], [5.3, 5, 0],
  ])("%d → %d whole + %d beaten", (v, whole, beaten) => {
    const r = splitEggs(v);
    expect(r.whole).toBe(whole);
    expect(r.beaten).toBeCloseTo(beaten, 10);
  });
});

it("roundHalf (rule 7): nearest ½, never 0", () => {
  expect(roundHalf(2.3)).toBe(2.5);
  expect(roundHalf(2.2)).toBe(2);
  expect(roundHalf(0.1)).toBe(0.5);
});

it("snapCount: US fractions, never 0", () => {
  expect(snapCount(0.5)).toBe(0.5);
  expect(snapCount(0.01)).toBe(1 / 8);
});

// ── properties ──────────────────────────────────────────────────────────
const partsToBase = (parts: Part[]) =>
  parts.reduce((sum, p) => (p.kind === "qty" && p.unit ? sum + toBase(p.value, p.unit) : sum), 0);

describe("error bounds (properties)", () => {
  // Worst case is on the smallest rung, which never splits: the widest fraction gap is ¾→1 (¼),
  // so the max absolute error is ⅛ unit, largest relative at 1⅞ units: 0.125 / 1.875 = 1/15 ≈ 6.67%.
  const US_BOUND = 1 / 15 + 1e-9;

  it("US volume ≥ 1 tsp is within 1/15 of exact", () => {
    fc.assert(
      fc.property(fc.double({ min: UNITS.tsp.toBase, max: cup(20), noNaN: true }), (ml) => {
        const parts = usParts(ml, US_VOLUME_LADDER);
        expect(parts.length).toBeLessThanOrEqual(2);
        expect(Math.abs(partsToBase(parts) - ml) / ml).toBeLessThanOrEqual(US_BOUND);
      }),
    );
  });

  it("US mass ≥ 1 oz is within 1/15 of exact", () => {
    fc.assert(
      fc.property(fc.double({ min: oz(1), max: oz(320), noNaN: true }), (g) => {
        const parts = usParts(g, US_MASS_LADDER);
        expect(Math.abs(partsToBase(parts) - g) / g).toBeLessThanOrEqual(US_BOUND);
      }),
    );
  });

  // 1 g steps from 10 g: max 0.5 / 10 = 5%. 5 g steps from 100 g: max 2.5 / 100 = 2.5%.
  it("metric ≥ 10 is within 5%, ≥ 100 within 2.5%", () => {
    fc.assert(
      fc.property(fc.double({ min: 10, max: 50_000, noNaN: true }), (g) => {
        const r = roundMetric(g);
        expect(Math.abs(r - g) / g).toBeLessThanOrEqual(g >= 100 ? 0.025 : 0.05 + 1e-9);
      }),
    );
  });
});
