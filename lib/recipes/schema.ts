// The editable shape of a recipe. One schema serves three jobs:
//   1. the editor's state and the Server Action's input (re-validated on the server),
//   2. what db/recipes.ts writes into the normalized tables,
//   3. the recipe_versions.snapshot format ({ schema: 1, ...draft }), so restore is one parse.
// Change it only together with a snapshot `schema` bump and a reader for old versions.
import { z } from "zod";
import { MAX_QUANTITY } from "@/lib/culinary/quantity";
import { scalingRuleSchema } from "@/lib/culinary/schemas";
import { UNIT_CODES, UNITS } from "@/lib/culinary/units";

/** Trimmed text; empty becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

const amount = z.number().positive().max(MAX_QUANTITY);
const minutes = z.number().int().min(0).max(10_000).nullable();

export const ingredientLineSchema = z
  .object({
    quantity: amount.nullable(),
    quantityMax: amount.nullable(),
    unitCode: z.enum(UNIT_CODES).nullable(),
    /** catalog or own ingredient; null = unmatched (scales, never converts volume↔mass) */
    ingredientId: z.uuid().nullable(),
    name: z.string().trim().min(1, "Name the ingredient.").max(200),
    preparation: optionalText(200),
    note: optionalText(500),
    isOptional: z.boolean(),
    /** null = use the ingredient's default rule */
    scalingRule: scalingRuleSchema.nullable(),
    /** the line as imported (doc §3.4); null for typed lines. Defaults keep v1 snapshots readable. */
    rawText: optionalText(500).default(null),
    /** the parser's confidence, 0–1; null for typed lines. 1 once someone has checked it. */
    parseConfidence: z.number().min(0).max(1).nullable().default(null),
  })
  .refine((l) => l.quantityMax === null || (l.quantity !== null && l.quantityMax > l.quantity), {
    message: "A range needs a smaller first number.",
    path: ["quantityMax"],
  });
export type IngredientLine = z.infer<typeof ingredientLineSchema>;

export const sectionSchema = z.object({
  /** null only for the single untitled section of a recipe without sections */
  title: optionalText(100),
  ingredients: z.array(ingredientLineSchema).max(100),
});
export type Section = z.infer<typeof sectionSchema>;

export const stepSchema = z.object({ body: z.string().trim().min(1, "Write the step or remove it.").max(5000) });

export const recipeDraftSchema = z
  .object({
    title: z.string().trim().min(1, "Give the recipe a title.").max(200),
    description: optionalText(2000),
    yieldQty: amount.nullable(),
    yieldUnit: optionalText(50),
    panId: z.uuid().nullable(),
    prepMin: minutes,
    cookMin: minutes,
    ovenTempC: z.number().positive().max(400).nullable(),
    sections: z.array(sectionSchema).min(1).max(20),
    steps: z.array(stepSchema).max(100),
  })
  .refine((d) => d.sections.length === 1 || d.sections.every((s) => s.title !== null), {
    message: "With more than one section, every section needs a title.",
    path: ["sections"],
  });
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;
/** What the editor builds before validation (strings not yet trimmed etc.). */
export type RecipeDraftInput = z.input<typeof recipeDraftSchema>;

export const SNAPSHOT_SCHEMA = 1;
export const recipeSnapshotSchema = z.object({ schema: z.literal(SNAPSHOT_SCHEMA), draft: recipeDraftSchema });
export type RecipeSnapshot = z.infer<typeof recipeSnapshotSchema>;

export function emptyLine(): IngredientLine {
  return {
    quantity: null, quantityMax: null, unitCode: null, ingredientId: null, name: "",
    preparation: null, note: null, isOptional: false, scalingRule: null, rawText: null, parseConfidence: null,
  };
}

export function emptyDraft(): RecipeDraft {
  return {
    title: "", description: null, yieldQty: null, yieldUnit: null, panId: null,
    prepMin: null, cookMin: null, ovenTempC: null,
    sections: [{ title: null, ingredients: [] }],
    steps: [],
  };
}

/** °F ↔ °C for the oven field; stored in °C (recipes.oven_temp_c), shown to the nearest 5. */
export const fahrenheitToC = (f: number) => Math.round((((f - 32) * 5) / 9) * 10) / 10;
export const cToFahrenheit = (c: number) => Math.round(((c * 9) / 5 + 32) / 5) * 5;

/** Grams per cup → g/ml, the stored density (doc §3.7). */
export const gramsPerCupToDensity = (g: number) => Math.round((g / UNITS.cup.toBase) * 10_000) / 10_000;
