import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatQuantity, MAX_QUANTITY, parseQuantity } from "./quantity";

const ok = (quantity: number | null, quantityMax: number | null = null) => ({ ok: true, quantity, quantityMax });

describe("parseQuantity", () => {
  it.each([
    ["2", ok(2)],
    ["1.5", ok(1.5)],
    [".5", ok(0.5)],
    ["½", ok(0.5)],
    ["1½", ok(1.5)],
    ["1 ½", ok(1.5)],
    ["1/2", ok(0.5)],
    ["1 1/2", ok(1.5)],
    ["1 / 3", ok(1 / 3)],
    ["1-1/2", ok(1.5)],
    ["2 - ½", ok(2.5)],
    ["2-3", ok(2, 3)],
    ["2–3", ok(2, 3)],
    ["2 — 3", ok(2, 3)],
    ["2 to 3", ok(2, 3)],
    ["½-1", ok(0.5, 1)],
    ["1½–2", ok(1.5, 2)],
    ["3-3", ok(3)],
    ["  4  ", ok(4)],
    ["", ok(null)],
    ["   ", ok(null)],
  ])("%j", (text, expected) => {
    const r = parseQuantity(text);
    expect(r).toMatchObject(expected);
    if (r.ok && expected.quantity !== null) expect(r.quantity).toBeCloseTo(expected.quantity, 9);
  });

  it.each([
    ["abc", "Use a number"],
    ["1/0", "Use a number"],
    ["1,5", "Use a number"],
    ["2-3-4", "Use a number"],
    ["2-x", "Use a number"],
    ["11/2/3", "Use a number"],
    ["0", "more than 0"],
    ["0-2", "more than 0"],
    ["3-2", "smaller number first"],
    [String(MAX_QUANTITY + 1), "too large"],
    [`1-${MAX_QUANTITY + 1}`, "too large"],
  ])("rejects %j", (text, message) => {
    const r = parseQuantity(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });

  it("round-trips everything formatQuantity writes", () => {
    const fracs = [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
    const value = fc
      .tuple(fc.integer({ min: 0, max: 500 }), fc.constantFrom(...fracs))
      .map(([w, f]) => w + f)
      .filter((v) => v > 0);
    fc.assert(
      fc.property(value, fc.option(value, { nil: null }), (a, b) => {
        const [lo, hi] = b === null || b === a ? [a, null] : [Math.min(a, b), Math.max(a, b)];
        const r = parseQuantity(formatQuantity(lo, hi));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.quantity).toBeCloseTo(lo, 9);
        if (hi === null) expect(r.quantityMax).toBeNull();
        else expect(r.quantityMax).toBeCloseTo(hi, 9);
      }),
    );
  });

  it("round-trips 2-decimal values", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (n) => {
        const v = n / 100;
        const r = parseQuantity(formatQuantity(v));
        expect(r.ok && r.quantity).toBeCloseTo(v, 2);
      }),
    );
  });
});

describe("formatQuantity", () => {
  it.each([
    [null, null, ""],
    [2, null, "2"],
    [1.5, null, "1½"],
    [0.75, null, "¾"],
    [2, 3, "2–3"],
    [1.25, null, "1¼"],
    [1.3, null, "1.3"],
  ])("%s, %s → %j", (q, max, text) => expect(formatQuantity(q, max)).toBe(text));
});
