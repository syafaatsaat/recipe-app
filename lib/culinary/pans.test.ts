import { describe, expect, it } from "vitest";
import { panArea, panFactor } from "./pans";
import type { Pan } from "./schemas";

let n = 0;
const pan = (p: Partial<Pan> & Pick<Pan, "shape">): Pan => ({
  id: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`,
  diameterCm: null, widthCm: null, lengthCm: null, depthCm: null, volumeMl: null, cupCount: null,
  ...p,
});
const IN = 2.54;
const round8 = pan({ shape: "round", diameterCm: 8 * IN, depthCm: 2 * IN });
const round9 = pan({ shape: "round", diameterCm: 9 * IN, depthCm: 2 * IN });
const rect9x13 = pan({ shape: "rectangle", widthCm: 9 * IN, lengthCm: 13 * IN, depthCm: 2 * IN });
const rect9x13NoDepth = pan({ shape: "rectangle", widthCm: 9 * IN, lengthCm: 13 * IN });
const bundt10 = pan({ shape: "bundt", volumeMl: 2366 });
const muffin12 = pan({ shape: "muffin", cupCount: 12 });
const muffin24 = pan({ shape: "muffin", cupCount: 24 });

const ok = (r: ReturnType<typeof panFactor>) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r;
};

describe("panArea", () => {
  it("round π·r², rect w·l (in²: 9in round = 63.6, 9×13 = 117)", () => {
    expect(panArea(round9)! / IN ** 2).toBeCloseTo(63.62, 2);
    expect(panArea(rect9x13)! / IN ** 2).toBeCloseTo(117, 6);
    expect(panArea(bundt10)).toBeNull();
    expect(panArea(pan({ shape: "round" }))).toBeNull();
  });
});

describe("panFactor", () => {
  it("doc: 9in round → 9×13 = 1.84×, shape change changes bake time", () => {
    const r = ok(panFactor(round9, rect9x13, false));
    expect(r.factor).toBeCloseTo(1.84, 2);
    expect(r.warnings).toEqual(expect.arrayContaining(["SHAPE_CHANGE", "BAKE_TIME_CHANGES"]));
    expect(r.bakeHint).toBeUndefined(); // same depth: no direction
  });

  it("8in → 9in round = (9/8)² with no warnings", () => {
    const r = ok(panFactor(round8, round9, false));
    expect(r.factor).toBeCloseTo(81 / 64, 10);
    expect(r.warnings).toEqual([]);
  });

  it("useDepth with both depths uses the volume ratio and hints deeper", () => {
    const deep = pan({ shape: "rectangle", widthCm: 9 * IN, lengthCm: 13 * IN, depthCm: 3 * IN });
    const r = ok(panFactor(rect9x13, deep, true));
    expect(r.factor).toBeCloseTo(1.5, 10);
    expect(r.warnings).toEqual(["BAKE_TIME_CHANGES"]);
    expect(r.bakeHint).toEqual({ direction: "deeper" });
  });

  it("without useDepth the factor is by area even when depths differ, but bake time still warns", () => {
    const deep = pan({ shape: "rectangle", widthCm: 9 * IN, lengthCm: 13 * IN, depthCm: 3 * IN });
    const r = ok(panFactor(rect9x13, deep, false));
    expect(r.factor).toBeCloseTo(1, 10);
    expect(r.bakeHint).toEqual({ direction: "deeper" });
  });

  it("depth ratio: exactly 20% does not warn, just over does; shallower hints shallower", () => {
    const src = pan({ shape: "square", widthCm: 20, lengthCm: 20, depthCm: 5 });
    const at20 = pan({ shape: "square", widthCm: 20, lengthCm: 20, depthCm: 6 });
    const over20 = pan({ shape: "square", widthCm: 20, lengthCm: 20, depthCm: 6.05 });
    const shallow = pan({ shape: "square", widthCm: 20, lengthCm: 20, depthCm: 3.75 });
    expect(ok(panFactor(src, at20, true)).warnings).toEqual([]);
    expect(ok(panFactor(src, over20, true)).warnings).toEqual(["BAKE_TIME_CHANGES"]);
    expect(ok(panFactor(src, shallow, true)).bakeHint).toEqual({ direction: "shallower" });
  });

  it("useDepth with a missing depth falls back to area and warns DEPTH_UNKNOWN", () => {
    const r = ok(panFactor(round9, rect9x13NoDepth, true));
    expect(r.factor).toBeCloseTo(1.84, 2);
    expect(r.warnings).toContain("DEPTH_UNKNOWN");
  });

  it("area pan ↔ volume pan uses the area pan's depth", () => {
    // 9×13×2 in = 754.84 cm² × 5.08 cm = 3834.6 ml; ÷ 2366 = 1.6207
    const r = ok(panFactor(bundt10, rect9x13, false));
    expect(r.factor).toBeCloseTo(3834.59 / 2366, 3);
    expect(r.warnings).toEqual(expect.arrayContaining(["SHAPE_CHANGE", "BAKE_TIME_CHANGES"]));
    expect(r.warnings).not.toContain("DEPTH_UNKNOWN");
  });

  it("area pan without depth vs volume pan assumes 5 cm and warns DEPTH_UNKNOWN", () => {
    const r = ok(panFactor(bundt10, rect9x13NoDepth, false));
    expect(r.factor).toBeCloseTo((754.8372 * 5) / 2366, 4);
    expect(r.warnings).toContain("DEPTH_UNKNOWN");
  });

  it("bundt ↔ tube is the same class: volume ratio, no shape change", () => {
    const tube = pan({ shape: "tube", volumeMl: 3549 });
    const r = ok(panFactor(bundt10, tube, false));
    expect(r.factor).toBeCloseTo(1.5, 3);
    expect(r.warnings).toEqual([]);
  });

  it("muffin → muffin uses cup count", () => {
    expect(ok(panFactor(muffin12, muffin24, false)).factor).toBe(2);
  });

  it("unsupported: muffin ↔ non-muffin, 'other' without volume, pans missing dimensions", () => {
    expect(panFactor(muffin12, round9, false)).toEqual({ ok: false, error: "UNSUPPORTED_PAN" });
    expect(panFactor(round9, muffin12, false)).toEqual({ ok: false, error: "UNSUPPORTED_PAN" });
    expect(panFactor(round9, pan({ shape: "other" }), false)).toEqual({ ok: false, error: "UNSUPPORTED_PAN" });
    expect(panFactor(pan({ shape: "round" }), round9, false)).toEqual({ ok: false, error: "UNSUPPORTED_PAN" });
    expect(panFactor(round9, pan({ shape: "muffin" }), false)).toEqual({ ok: false, error: "UNSUPPORTED_PAN" });
  });

  it("'other' with a volume works as a volume pan", () => {
    const other = pan({ shape: "other", volumeMl: 4732 });
    expect(ok(panFactor(bundt10, other, false)).factor).toBeCloseTo(2, 3);
  });
});
