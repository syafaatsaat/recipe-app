import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { convert } from "./convert";
import { toBase } from "./units";

const flour = { densityGPerMl: 0.5072, preferMassInMetric: true };
const milk = { densityGPerMl: 1.031, preferMassInMetric: false };
const walnuts = { densityGPerMl: null, preferMassInMetric: true };

describe("convert", () => {
  it("US volume → metric mass when density is known and mass is preferred (1 cup flour ≈ 120 g)", () => {
    const r = convert(1, "cup", flour, "metric");
    expect(r.dimension).toBe("mass");
    expect(r.base).toBeCloseTo(120, 0);
  });

  it("liquids stay volume in metric (preferMassInMetric false)", () => {
    expect(convert(1, "cup", milk, "metric")).toEqual({ dimension: "volume", base: toBase(1, "cup") });
  });

  it("metric mass → US volume when density is known (113 g butter ≈ ½ cup)", () => {
    const r = convert(113, "g", { densityGPerMl: 0.959, preferMassInMetric: true }, "us");
    expect(r.dimension).toBe("volume");
    expect(r.base / toBase(1, "cup")).toBeCloseTo(0.498, 3);
  });

  it("unknown density never crosses dimensions", () => {
    expect(convert(1, "cup", walnuts, "metric").dimension).toBe("volume");
    expect(convert(100, "g", walnuts, "us").dimension).toBe("mass");
  });

  it("same system keeps the dimension even with a density", () => {
    expect(convert(2, "cup", flour, "us")).toEqual({ dimension: "volume", base: toBase(2, "cup") });
    expect(convert(250, "ml", flour, "metric")).toEqual({ dimension: "volume", base: 250 });
  });

  it("US mass → metric mass; metric volume → US volume", () => {
    expect(convert(1, "lb", flour, "metric")).toEqual({ dimension: "mass", base: toBase(1, "lb") });
    expect(convert(250, "ml", milk, "us")).toEqual({ dimension: "volume", base: 250 });
  });

  it("property: US volume → metric mass → US volume is lossless before rounding", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 50, noNaN: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        (cups, density) => {
          const ing = { densityGPerMl: density, preferMassInMetric: true };
          const toMetric = convert(cups, "cup", ing, "metric");
          const back = convert(toMetric.base, "g", ing, "us");
          expect(back.dimension).toBe("volume");
          expect(back.base).toBeCloseTo(toBase(cups, "cup"), 6);
        },
      ),
    );
  });
});
