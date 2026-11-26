// Seeds a recipe straight into local Supabase for e2e flows that test the view,
// not the editor (the editor has its own flow in recipes.spec.ts).
import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { matchIngredient } from "@/db/ingredients";
import { listPans } from "@/db/pans";
import { createRecipe } from "@/db/recipes";
import { emptyLine, type IngredientLine, type RecipeDraft } from "@/lib/recipes/schema";

const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The canvas brownies (doc §8): 9 in round, 12 squares, every rule the view shows. */
export async function seedBrownies(email: string): Promise<string> {
  const { db, client } = createDb(URL);
  try {
    const [{ id: userId }] = (await db.execute(sql`select id from auth.users where email = ${email}`)) as unknown as { id: string }[];
    const pans = await listPans(db, userId);
    const line = async (o: Partial<IngredientLine> & { name: string }): Promise<IngredientLine> => ({
      ...emptyLine(),
      ingredientId: (await matchIngredient(db, userId, o.name))?.id ?? null,
      ...o,
    });
    const draft: RecipeDraft = {
      title: "Fudgy cocoa brownies",
      description: null,
      yieldQty: 12,
      yieldUnit: "squares",
      panId: pans.find((p) => p.label === "9 in round")!.id,
      prepMin: 15,
      cookMin: 25,
      ovenTempC: 176.7,
      ovenUnit: "F",
      sections: [
        {
          title: null,
          ingredients: [
            await line({ quantity: 10, unitCode: "tbsp", name: "unsalted butter", preparation: "melted" }),
            await line({ quantity: 1.25, unitCode: "cup", name: "granulated sugar" }),
            await line({ quantity: 2, name: "large eggs" }),
            await line({ quantity: 1, unitCode: "tsp", name: "vanilla extract" }),
            await line({ quantity: 0.75, unitCode: "cup", name: "cocoa powder" }),
            await line({ quantity: 0.5, unitCode: "cup", name: "all-purpose flour" }),
            await line({ quantity: 0.5, unitCode: "tsp", name: "baking powder" }),
            await line({ quantity: 0.25, unitCode: "tsp", name: "salt" }),
            await line({ name: "flaky salt", preparation: "for the top" }),
          ],
        },
      ],
      steps: [{ body: "Heat the oven. Line the pan with baking paper." }, { body: "Mix, spread in the pan and bake until just set." }],
    };
    return await createRecipe(db, userId, draft);
  } finally {
    await client.end();
  }
}

/** Deletes an account behind its open session, like `pnpm db:reset` or a deleted user. */
export async function deleteAccount(email: string): Promise<void> {
  const { db, client } = createDb(URL);
  try {
    await db.execute(sql`delete from auth.users where email = ${email}`);
  } finally {
    await client.end();
  }
}
