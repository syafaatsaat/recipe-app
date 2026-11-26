import { describe, expect, it } from "vitest";
import { isMissingAccount } from "./missing-account";

describe("isMissingAccount", () => {
  it("spots an owner_id foreign-key failure, also wrapped by Drizzle", () => {
    const pg = { code: "23503", constraint_name: "import_jobs_owner_id_fkey" };
    expect(isMissingAccount(pg)).toBe(true);
    expect(isMissingAccount(Object.assign(new Error("Failed query"), { cause: pg }))).toBe(true);
  });

  it("ignores other failures", () => {
    expect(isMissingAccount({ code: "23503", constraint_name: "recipe_ingredients_ingredient_id_fkey" })).toBe(false);
    expect(isMissingAccount({ code: "42501" })).toBe(false);
    expect(isMissingAccount(new Error("boom"))).toBe(false);
    expect(isMissingAccount(null)).toBe(false);
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(isMissingAccount(loop)).toBe(false);
  });
});
