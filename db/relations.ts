// Hand-written: drizzle-kit pull generates wrong joins for composite FKs
// (e.g. recipe_ingredients.recipe_id = recipe_sections.id). Keep in sync with supabase/migrations.
import { relations } from "drizzle-orm";
import {
  ingredients, pans, recipes, recipeSections, recipeIngredients,
  recipeSteps, recipeImages, recipeVersions, importJobs,
} from "./schema";

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  pan: one(pans, { fields: [recipes.panId], references: [pans.id] }),
  currentVersion: one(recipeVersions, {
    fields: [recipes.currentVersionId],
    references: [recipeVersions.id],
    relationName: "currentVersion",
  }),
  versions: many(recipeVersions, { relationName: "versions" }),
  sections: many(recipeSections),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
  images: many(recipeImages),
}));

export const recipeVersionsRelations = relations(recipeVersions, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeVersions.recipeId],
    references: [recipes.id],
    relationName: "versions",
  }),
}));

export const recipeSectionsRelations = relations(recipeSections, ({ one, many }) => ({
  recipe: one(recipes, { fields: [recipeSections.recipeId], references: [recipes.id] }),
  ingredients: many(recipeIngredients),
  steps: many(recipeSteps),
}));

export const recipeIngredientsRelations = relations(recipeIngredients, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeIngredients.recipeId], references: [recipes.id] }),
  section: one(recipeSections, { fields: [recipeIngredients.sectionId], references: [recipeSections.id] }),
  ingredient: one(ingredients, { fields: [recipeIngredients.ingredientId], references: [ingredients.id] }),
}));

export const recipeStepsRelations = relations(recipeSteps, ({ one, many }) => ({
  recipe: one(recipes, { fields: [recipeSteps.recipeId], references: [recipes.id] }),
  section: one(recipeSections, { fields: [recipeSteps.sectionId], references: [recipeSections.id] }),
  images: many(recipeImages),
}));

export const recipeImagesRelations = relations(recipeImages, ({ one }) => ({
  recipe: one(recipes, { fields: [recipeImages.recipeId], references: [recipes.id] }),
  step: one(recipeSteps, { fields: [recipeImages.stepId], references: [recipeSteps.id] }),
}));

export const ingredientsRelations = relations(ingredients, ({ many }) => ({
  recipeIngredients: many(recipeIngredients),
}));

export const pansRelations = relations(pans, ({ many }) => ({
  recipes: many(recipes),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  recipe: one(recipes, { fields: [importJobs.recipeId], references: [recipes.id] }),
}));
