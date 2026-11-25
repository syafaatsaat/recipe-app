import { describe, expect, it } from "vitest";
import { bakingPowder, flour, PAN_9_ROUND, PAN_9X13, PAN_MUFFIN, recipe } from "./fixtures";
import { isLeaveningExtreme, resolveFactor, scalesWithFactor } from "./scale";

const plain = recipe([flour(1)], { yieldQty: 24, pan: PAN_9_ROUND });
const leavened = recipe([flour(1), bakingPowder(1)], { yieldQty: 24 });

describe("resolveFactor", () => {
  it("none → 1, factor → as given", () => {
    expect(resolveFactor(plain, { mode: "none" })).toEqual({ ok: true, factor: 1, warnings: [] });
    expect(resolveFactor(plain, { mode: "factor", factor: 2 })).toEqual({ ok: true, factor: 2, warnings: [] });
  });

  it("yield: 24 → 36 cookies = 1.5×", () => {
    expect(resolveFactor(plain, { mode: "yield", targetQty: 36 })).toMatchObject({ ok: true, factor: 1.5 });
  });

  it("yield without a recipe yield is an error", () => {
    expect(resolveFactor(recipe([flour(1)]), { mode: "yield", targetQty: 36 })).toEqual({ ok: false, error: "NO_YIELD" });
  });

  it("pan: uses the pan list, passes warnings through", () => {
    const r = resolveFactor(plain, { mode: "pan", targetPanId: PAN_9X13.id, useDepth: false }, [PAN_9X13]);
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.factor).toBeCloseTo(1.84, 2);
      expect(r.warnings).toContain("SHAPE_CHANGE");
    }
  });

  it("pan: the recipe's own pan needs no lookup and gives 1×", () => {
    expect(resolveFactor(plain, { mode: "pan", targetPanId: PAN_9_ROUND.id, useDepth: true })).toEqual({
      ok: true, factor: 1, warnings: [],
    });
  });

  it("pan errors: no recipe pan, unknown target, unsupported combination", () => {
    const s = { mode: "pan", targetPanId: PAN_9X13.id, useDepth: false } as const;
    expect(resolveFactor(recipe([flour(1)]), s, [PAN_9X13])).toEqual({ ok: false, error: "NO_PAN" });
    expect(resolveFactor(plain, s, [])).toEqual({ ok: false, error: "UNKNOWN_PAN" });
    expect(resolveFactor(plain, { ...s, targetPanId: PAN_MUFFIN.id }, [PAN_MUFFIN])).toEqual({
      ok: false, error: "UNSUPPORTED_PAN",
    });
  });

  it("rule 13 applies to computed factors too", () => {
    expect(resolveFactor(plain, { mode: "yield", targetQty: 24 * 101 })).toEqual({ ok: false, error: "FACTOR_OUT_OF_RANGE" });
    expect(resolveFactor(plain, { mode: "yield", targetQty: 0.2 })).toEqual({ ok: false, error: "FACTOR_OUT_OF_RANGE" });
    expect(resolveFactor(plain, { mode: "yield", targetQty: 2400 })).toMatchObject({ ok: true, factor: 100 });
  });

  it("rule 12: leavening warns only outside [0.5, 2], and only if the recipe has leavening", () => {
    const warns = (factor: number) => {
      const r = resolveFactor(leavened, { mode: "factor", factor });
      return r.ok && r.warnings.includes("LEAVENING_EXTREME");
    };
    expect(warns(2)).toBe(false);
    expect(warns(2.01)).toBe(true);
    expect(warns(0.5)).toBe(false);
    expect(warns(0.49)).toBe(true);
    const noLeavening = resolveFactor(plain, { mode: "factor", factor: 3 });
    expect(noLeavening.ok && noLeavening.warnings).toEqual([]);
  });
});

it("isLeaveningExtreme / scalesWithFactor", () => {
  expect(isLeaveningExtreme(1)).toBe(false);
  expect(isLeaveningExtreme(3)).toBe(true);
  expect(scalesWithFactor("linear")).toBe(true);
  expect(scalesWithFactor("leavening")).toBe(true);
  expect(scalesWithFactor("count_round")).toBe(true);
  expect(scalesWithFactor("to_taste")).toBe(false);
  expect(scalesWithFactor("fixed")).toBe(false);
});
