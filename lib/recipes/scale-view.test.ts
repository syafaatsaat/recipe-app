import { describe, expect, it } from "vitest";
import { render, type Pan, type RenderedRecipe } from "@/lib/culinary";
import { bakingPowder, eggs, flour, IN, PAN_9_ROUND, PAN_9X13, PAN_MUFFIN, recipe } from "@/lib/culinary/fixtures";
import {
  activeChip, chipScale, depthApplies, factorText, isScaledView, moreLabel, ovenText, panOptions,
  parseFactorInput, parseYieldInput, scaledYieldText, shortPanLabel, warningNotes,
} from "./scale-view";

const labelled = <P extends Pan>(p: P, label: string) => ({ ...p, label });
const ROUND = labelled(PAN_9_ROUND, "9 in round");
const RECT = labelled(PAN_9X13, "9×13 in rectangle");
const MUFFIN = labelled(PAN_MUFFIN, "12-cup muffin tin");
const SHEET = labelled(
  { ...PAN_9X13, id: "44444444-0000-0000-0000-000000001813", widthCm: 13 * IN, lengthCm: 18 * IN, depthCm: 1 * IN, shape: "sheet" as const },
  "Half sheet (18×13 in)",
);
const BUNDT = labelled(
  { ...PAN_MUFFIN, id: "55555555-0000-0000-0000-000000000010", shape: "bundt" as const, cupCount: null, volumeMl: 2366 },
  "10-cup bundt",
);
const BARE = labelled({ ...BUNDT, id: "66666666-0000-0000-0000-000000000000", shape: "other" as const, volumeMl: null }, "Odd pan");
const PANS = [RECT, ROUND, MUFFIN, SHEET, BUNDT, BARE];

describe("chips", () => {
  it("marks the matching chip, and More for anything else", () => {
    expect(activeChip({ mode: "none" })).toBe(1);
    expect(activeChip({ mode: "factor", factor: 2 })).toBe(2);
    expect(activeChip({ mode: "factor", factor: 0.5 })).toBe(0.5);
    expect(activeChip({ mode: "factor", factor: 1.5 })).toBe("more");
    expect(activeChip({ mode: "yield", targetQty: 18 })).toBe("more");
    expect(activeChip({ mode: "pan", targetPanId: RECT.id, useDepth: false })).toBe("more");
  });

  it("1× clears the mode", () => {
    expect(chipScale(1)).toEqual({ mode: "none" });
    expect(chipScale(3)).toEqual({ mode: "factor", factor: 3 });
  });

  it("More names the active pan", () => {
    expect(moreLabel({ mode: "pan", targetPanId: RECT.id, useDepth: false }, PANS)).toBe("9×13");
    expect(moreLabel({ mode: "pan", targetPanId: SHEET.id, useDepth: false }, PANS)).toBe("Half sheet");
    expect(moreLabel({ mode: "pan", targetPanId: ROUND.id, useDepth: false }, PANS)).toBe("9 in round");
    expect(moreLabel({ mode: "pan", targetPanId: "77777777-0000-0000-0000-000000000000", useDepth: false }, PANS)).toBe("More");
    expect(moreLabel({ mode: "factor", factor: 1.5 }, PANS)).toBe("More");
  });

  it("shortens pan labels", () => {
    expect(shortPanLabel("8×8 in square")).toBe("8×8");
    expect(shortPanLabel("10-cup bundt")).toBe("10-cup bundt");
  });

  it("formats the readout with at most 2 decimals", () => {
    expect(factorText(1.8386)).toBe("×1.84");
    expect(factorText(0.5)).toBe("×0.5");
    expect(factorText(2)).toBe("×2");
  });

  it("knows when Reset applies", () => {
    expect(isScaledView({ mode: "none" }, "us", "us")).toBe(false);
    expect(isScaledView({ mode: "none" }, "metric", "us")).toBe(true);
    expect(isScaledView({ mode: "factor", factor: 2 }, "us", "us")).toBe(true);
  });
});

describe("warningNotes", () => {
  const input = recipe([flour(1), bakingPowder(1), eggs(2)], { pan: PAN_9_ROUND, yieldQty: 12 });
  const ok = (r: RenderedRecipe) => r;

  it("is empty when nothing needs saying", () => {
    expect(warningNotes(render(input, { mode: "factor", factor: 2 }, "us"), input)).toEqual([]);
  });

  it("names the leavening, both directions", () => {
    expect(warningNotes(render(input, { mode: "factor", factor: 3 }, "us"), input)).toEqual([
      "Baking powder doesn’t always scale past 2×. Consider two batches.",
    ]);
    const two = recipe([bakingPowder(1), { ...bakingPowder(1), id: "soda", name: "baking soda" }]);
    expect(warningNotes(render(two, { mode: "factor", factor: 0.25 }, "us"), two)).toEqual([
      "Baking powder and baking soda don’t always scale below ½×. Check the rise.",
    ]);
  });

  it("explains a shape change, round to rectangle", () => {
    const r = render(input, { mode: "pan", targetPanId: RECT.id, useDepth: false }, "us", { pans: PANS });
    expect(warningNotes(r, input, { source: ROUND, target: RECT })).toEqual(["Round to rectangle changes the bake time. Start checking early."]);
  });

  it("uses the bake hint for depth, never a percentage", () => {
    const r = render(input, { mode: "pan", targetPanId: SHEET.id, useDepth: false }, "us", { pans: PANS });
    const notes = warningNotes(r, input, { source: ROUND, target: SHEET });
    expect(notes).toEqual([
      "Round to rectangle changes the bake time.",
      "The batter will be shallower, so it bakes faster. Start checking early.",
      "Baking powder doesn’t always scale past 2×. Consider two batches.",
    ]);
    expect(notes.join(" ")).not.toMatch(/%/);
    const deeper = ok({ ok: true, factor: 1, units: "us", warnings: ["BAKE_TIME_CHANGES"], bakeHint: { direction: "deeper" }, ingredients: [] });
    expect(warningNotes(deeper, input)).toEqual(["The batter will be deeper, so it needs longer and maybe a lower oven temperature."]);
  });

  it("covers the remaining warnings", () => {
    const r = ok({ ok: true, factor: 1, units: "us", warnings: ["BAKE_TIME_CHANGES", "DEPTH_UNKNOWN"], ingredients: [] });
    expect(warningNotes(r, input)).toEqual([
      "The bake time may change. Start checking early.",
      "One pan has no depth set, so a 5 cm depth was assumed.",
    ]);
  });

  it("turns render errors into one sentence", () => {
    const r = render(recipe([flour(1)], { yieldQty: 1 }), { mode: "yield", targetQty: 1000 }, "us");
    expect(warningNotes(r, input)).toEqual(["That’s outside what the recipe can scale to (0.01× to 100×), so it shows as written."]);
    expect(warningNotes(render(recipe([flour(1)]), { mode: "yield", targetQty: 2 }, "us"), input)[0]).toMatch(/no yield/);
  });
});

describe("panOptions", () => {
  const opts = panOptions(ROUND, PANS, false);

  it("puts the recipe's pan first, as the original", () => {
    expect(opts[0]).toMatchObject({ id: ROUND.id, isOriginal: true, factor: 1, size: "63.6 in²" });
    expect(opts.filter((o) => o.isOriginal)).toHaveLength(1);
  });

  it("gives each pan its area and factor", () => {
    expect(opts.find((o) => o.id === RECT.id)).toMatchObject({ size: "117 in²", disabledReason: null });
    expect(opts.find((o) => o.id === RECT.id)!.factor).toBeCloseTo(1.84, 2);
    expect(opts.find((o) => o.id === BUNDT.id)).toMatchObject({ size: "10 cups", diagram: { kind: "ring" } });
  });

  it("disables what can't be converted, with a reason", () => {
    expect(opts.find((o) => o.id === MUFFIN.id)).toMatchObject({ factor: null, size: "12 cups", disabledReason: "Can’t convert a cake pan to muffins", diagram: { kind: "muffin" } });
    expect(opts.find((o) => o.id === BARE.id)).toMatchObject({ factor: null, size: null, disabledReason: "Size not set for this pan" });
    expect(panOptions(MUFFIN, PANS, false).find((o) => o.id === RECT.id)!.disabledReason).toBe("Can’t convert muffins to a cake pan");
  });

  it("draws every pan at one scale, inside the box", () => {
    const round = opts[0].diagram;
    const sheet = opts.find((o) => o.id === SHEET.id)!.diagram;
    expect(round.kind).toBe("round");
    expect(sheet).toMatchObject({ kind: "rect" });
    if (round.kind !== "round" || sheet.kind !== "rect") throw new Error("kinds");
    expect(sheet.w).toBeLessThanOrEqual(94 + 1e-9);
    expect(sheet.h).toBeLessThanOrEqual(50 + 1e-9);
    expect(sheet.w / (round.r * 2)).toBeCloseTo(18 / 9, 5);
  });

  it("uses depths when asked", () => {
    expect(panOptions(ROUND, PANS, true).find((o) => o.id === SHEET.id)!.factor).toBeCloseTo((13 * 18 * 1) / (Math.PI * 4.5 ** 2 * 2), 3);
  });

  it("offers the depth option only when both pans have one", () => {
    expect(depthApplies(ROUND, RECT)).toBe(true);
    expect(depthApplies(ROUND, ROUND)).toBe(false);
    expect(depthApplies(ROUND, BUNDT)).toBe(false);
    expect(depthApplies(ROUND, null)).toBe(false);
  });
});

describe("meta text", () => {
  it("scales the yield", () => {
    expect(scaledYieldText(12, "squares", 1, "none")).toBe("12 squares");
    expect(scaledYieldText(12, "squares", 1.5, "factor")).toBe("18 squares");
    expect(scaledYieldText(5, null, 1.5, "factor")).toBe("about 8");
    expect(scaledYieldText(12, "squares", 1.84, "pan")).toBe("about 22 squares");
    expect(scaledYieldText(12, "squares", 2, "pan")).toBe("about 24 squares");
    expect(scaledYieldText(1, "loaf", 0.5, "factor")).toBe("½ loaf");
    expect(scaledYieldText(1, "loaf", 0.1, "factor")).toBe("about ¼ loaf");
    expect(scaledYieldText(null, "squares", 2, "factor")).toBeNull();
  });

  it("shows the oven in the selected system", () => {
    expect(ovenText(176.7, "us")).toBe("350 °F");
    expect(ovenText(176.7, "metric")).toBe("175 °C");
  });
});

describe("parseFactorInput", () => {
  it("accepts the ways people type a factor", () => {
    for (const [t, f] of [["1.5", 1.5], ["1½", 1.5], ["×2", 2], ["2x", 2], [" 0.1 ", 0.1], ["20", 20]] as const) {
      expect(parseFactorInput(t)).toEqual({ ok: true, factor: f });
    }
  });

  it("keeps to 0.1–20 and explains why", () => {
    expect(parseFactorInput("25")).toEqual({ ok: false, error: "Use a number between 0.1 and 20." });
    expect(parseFactorInput("0.05")).toMatchObject({ ok: false });
    expect(parseFactorInput("")).toEqual({ ok: false, error: "Enter a number, like 1.5." });
    expect(parseFactorInput("lots")).toMatchObject({ ok: false, error: "Enter a number, like 1.5 or 1½." });
    expect(parseFactorInput("2-3")).toEqual({ ok: false, error: "Enter one number, not a range." });
  });

  it("reads a yield target", () => {
    expect(parseYieldInput("18")).toEqual({ ok: true, qty: 18 });
    expect(parseYieldInput("")).toMatchObject({ ok: false });
    expect(parseYieldInput("18-24")).toEqual({ ok: false, error: "Enter one number, not a range." });
  });
});
