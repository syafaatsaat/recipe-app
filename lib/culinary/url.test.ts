import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ScaleState } from "./schemas";
import { parseScaleParams, toScaleParams } from "./url";

const PAN = "22222222-0000-0000-0000-000000000913";
const parse = (qs: string) => parseScaleParams(new URLSearchParams(qs));

describe("parseScaleParams", () => {
  it("parses each mode and units", () => {
    expect(parse("mode=factor&f=2&units=metric")).toEqual({ scale: { mode: "factor", factor: 2 }, units: "metric" });
    expect(parse("mode=yield&qty=36")).toEqual({ scale: { mode: "yield", targetQty: 36 }, units: null });
    expect(parse(`mode=pan&pan=${PAN}&depth=1`).scale).toEqual({ mode: "pan", targetPanId: PAN, useDepth: true });
    expect(parse(`mode=pan&pan=${PAN}`).scale).toEqual({ mode: "pan", targetPanId: PAN, useDepth: false });
    expect(parse("")).toEqual({ scale: { mode: "none" }, units: null });
  });

  it.each([
    "mode=factor&f=0", "mode=factor&f=-1", "mode=factor&f=101", "mode=factor&f=abc", "mode=factor&f=",
    "mode=factor&f=0x10", "mode=factor&f=Infinity", "mode=factor", "mode=yield&qty=0",
    "mode=pan&pan=not-a-uuid", "mode=pan", "mode=bogus",
  ])("invalid input falls back to none, never throws: %s", (qs) => {
    expect(parse(qs).scale).toEqual({ mode: "none" });
  });

  it("ignores unknown units", () => {
    expect(parse("units=imperial").units).toBeNull();
  });

  it("accepts a Next.js searchParams object (first value of arrays)", () => {
    expect(parseScaleParams({ mode: "factor", f: ["1.5", "9"], units: "us" })).toEqual({
      scale: { mode: "factor", factor: 1.5 }, units: "us",
    });
    expect(parseScaleParams({ mode: undefined }).scale).toEqual({ mode: "none" });
  });
});

describe("toScaleParams", () => {
  it("serialises each mode", () => {
    expect(toScaleParams({ mode: "none" }).toString()).toBe("");
    expect(toScaleParams({ mode: "factor", factor: 0.5 }, "metric").toString()).toBe("mode=factor&f=0.5&units=metric");
    expect(toScaleParams({ mode: "yield", targetQty: 36 }).toString()).toBe("mode=yield&qty=36");
    expect(toScaleParams({ mode: "pan", targetPanId: PAN, useDepth: true }).toString()).toBe(`mode=pan&pan=${PAN}&depth=1`);
  });

  it("property: parse(toScaleParams(s)) round-trips", () => {
    const state: fc.Arbitrary<ScaleState> = fc.oneof(
      fc.constant({ mode: "none" as const }),
      fc.double({ min: 0.01, max: 100, noNaN: true }).map((factor) => ({ mode: "factor" as const, factor })),
      fc.double({ min: 0.01, max: 10_000, noNaN: true }).map((targetQty) => ({ mode: "yield" as const, targetQty })),
      fc.record({ mode: fc.constant("pan" as const), targetPanId: fc.uuid(), useDepth: fc.boolean() }),
    );
    fc.assert(
      fc.property(state, fc.constantFrom("us" as const, "metric" as const, null), (s, units) => {
        expect(parseScaleParams(toScaleParams(s, units))).toEqual({ scale: s, units });
      }),
    );
  });
});
