import { describe, expect, it } from "vitest";
import { eggs, flour, PAN_9_ROUND, recipe } from "./fixtures";
import { ingredientInputSchema, renderInputSchema, scaleStateSchema } from "./schemas";

describe("schemas", () => {
  it("accepts a valid render input", () => {
    expect(renderInputSchema.safeParse(recipe([flour(1), eggs(2)], { yieldQty: 24, pan: PAN_9_ROUND })).success).toBe(true);
  });

  it("ranges need quantity ≤ quantityMax (mirrors the DB check)", () => {
    expect(ingredientInputSchema.safeParse({ ...flour(2), quantityMax: 3 }).success).toBe(true);
    expect(ingredientInputSchema.safeParse({ ...flour(3), quantityMax: 2 }).success).toBe(false);
    expect(ingredientInputSchema.safeParse({ ...flour(1), quantity: null, quantityMax: 2 }).success).toBe(false);
  });

  it("rejects unknown units, non-positive quantities", () => {
    expect(ingredientInputSchema.safeParse({ ...flour(1), unitCode: "cups" }).success).toBe(false);
    expect(ingredientInputSchema.safeParse({ ...flour(1), quantity: 0 }).success).toBe(false);
  });

  it("scale state: factor must be finite and within 0.01–100 (rule 13)", () => {
    for (const factor of [0.01, 1, 100]) expect(scaleStateSchema.safeParse({ mode: "factor", factor }).success).toBe(true);
    for (const factor of [0, 0.009, 100.1, NaN, Infinity, -2]) {
      expect(scaleStateSchema.safeParse({ mode: "factor", factor }).success).toBe(false);
    }
  });
});
