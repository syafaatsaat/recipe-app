// Zod schemas for the module's inputs. Types are inferred from these.
import { z } from "zod";
import { UNIT_CODES } from "./units";

export const MIN_FACTOR = 0.01;
export const MAX_FACTOR = 100;

export const unitSystemSchema = z.enum(["us", "metric"]);

/** Rule 13: finite and within 0.01–100. */
export const factorSchema = z.number().min(MIN_FACTOR).max(MAX_FACTOR);

// z.guid(): any 8-4-4-4-12 hex id (z.uuid() also enforces the RFC version/variant bits)
export const scaleStateSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("factor"), factor: factorSchema }),
  z.object({ mode: z.literal("yield"), targetQty: z.number().positive() }),
  z.object({ mode: z.literal("pan"), targetPanId: z.guid(), useDepth: z.boolean() }),
]);
export type ScaleState = z.infer<typeof scaleStateSchema>;

export const scalingRuleSchema = z.enum(["linear", "count_round", "leavening", "to_taste", "fixed"]);
export type ScalingRule = z.infer<typeof scalingRuleSchema>;

const positive = z.number().positive();

export const panShapeSchema = z.enum([
  "round", "square", "rectangle", "loaf", "springform", "sheet", "bundt", "tube", "muffin", "skillet", "other",
]);

export const panSchema = z.object({
  id: z.guid(),
  shape: panShapeSchema,
  diameterCm: positive.nullable(),
  widthCm: positive.nullable(),
  lengthCm: positive.nullable(),
  depthCm: positive.nullable(),
  volumeMl: positive.nullable(),
  cupCount: z.number().int().positive().nullable(),
});
export type Pan = z.infer<typeof panSchema>;

export const ingredientInputSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    quantity: positive.nullable(),
    quantityMax: positive.nullable(),
    unitCode: z.enum(UNIT_CODES).nullable(),
    preparation: z.string().nullable(),
    /** resolved: the line's own rule, else the catalog default, else 'linear' */
    rule: scalingRuleSchema,
    densityGPerMl: positive.nullable(),
    eachG: positive.nullable(),
    preferMassInMetric: z.boolean(),
    /** the catalog egg: enables the beaten-egg remainder (rule 6) */
    isEgg: z.boolean(),
  })
  .refine((i) => i.quantityMax === null || (i.quantity !== null && i.quantityMax >= i.quantity), {
    message: "quantityMax needs quantity and must be ≥ it",
  });
export type IngredientInput = z.infer<typeof ingredientInputSchema>;

export const renderInputSchema = z.object({
  yieldQty: positive.nullable(),
  pan: panSchema.nullable(),
  ingredients: z.array(ingredientInputSchema),
});
export type RenderInput = z.infer<typeof renderInputSchema>;
