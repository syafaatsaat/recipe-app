import { describe, expect, it } from "vitest";
import { formatDecimal, formatPart, formatParts, formatRange, formatUSNumber, unitLabel } from "./format";

describe("formatUSNumber", () => {
  it.each([
    [1.5, "1½"], [1 / 3, "⅓"], [2 / 3, "⅔"], [0.125, "⅛"], [0.25, "¼"], [0.75, "¾"],
    [2, "2"], [2 + 2 / 3, "2⅔"], [0.9999999, "1"],
    [1.3, "1.3"], // not an allowed fraction (as-entered values) → decimal
  ])("%d → %s", (v, s) => {
    expect(formatUSNumber(v)).toBe(s);
  });
});

describe("formatDecimal", () => {
  it.each([[1.25, "1.25"], [1.2, "1.2"], [120, "120"], [2.5, "2.5"], [1.005, "1"], [0.333, "0.33"]])("%d → %s", (v, s) => {
    expect(formatDecimal(v)).toBe(s);
  });
});

it("unitLabel pluralises only above 1", () => {
  expect(unitLabel("cup", 1)).toBe("cup");
  expect(unitLabel("cup", 0.5)).toBe("cup");
  expect(unitLabel("cup", 1.5)).toBe("cups");
  expect(unitLabel("tbsp", 3)).toBe("tbsp");
  expect(unitLabel("l", 2)).toBe("L");
  expect(unitLabel("fl_oz", 2)).toBe("fl oz");
});

describe("formatPart / formatParts", () => {
  it("US units use fractions, metric uses decimals, counts have no unit", () => {
    expect(formatPart({ kind: "qty", value: 1.5, unit: "cup" })).toBe("1½ cups");
    expect(formatPart({ kind: "qty", value: 2.5, unit: "g" })).toBe("2.5 g");
    expect(formatPart({ kind: "qty", value: 1.25, unit: "kg" })).toBe("1.25 kg");
    expect(formatPart({ kind: "qty", value: 0.5, unit: null })).toBe("½");
  });
  it("tiny amounts", () => {
    expect(formatPart({ kind: "pinch" })).toBe("pinch");
    expect(formatPart({ kind: "lt_half", unit: "g" })).toBe("<0.5 g");
  });
  it("joins two parts with +", () => {
    expect(formatParts([{ kind: "qty", value: 1 / 3, unit: "cup" }, { kind: "qty", value: 2, unit: "tsp" }])).toBe("⅓ cup + 2 tsp");
  });
});

describe("formatRange", () => {
  it("shares the unit, label follows the larger end", () => {
    expect(formatRange(2, 3, "cup")).toBe("2–3 cups");
    expect(formatRange(0.5, 1, "cup")).toBe("½–1 cup");
    expect(formatRange(1.5, 2, null)).toBe("1½–2");
    expect(formatRange(1, 1.25, "kg")).toBe("1–1.25 kg");
  });
});
