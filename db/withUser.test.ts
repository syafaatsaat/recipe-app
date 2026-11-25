import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createDb } from "./client";
import { withUser } from "./withUser";
import { recipes } from "./schema";

const URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const { db, client } = createDb(URL);

const ALICE = "aaaaaaaa-1111-0000-0000-000000000000";
const BOB = "bbbbbbbb-1111-0000-0000-000000000000";

beforeAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`);
  await db.execute(sql`insert into auth.users (id, email) values (${ALICE}, 'a1@test.local'), (${BOB}, 'b1@test.local')`);
  await db.insert(recipes).values([
    { ownerId: ALICE, title: "Alice cake", sourceType: "manual" },
    { ownerId: BOB, title: "Bob bread", sourceType: "manual" },
  ]);
});

afterAll(async () => {
  await db.execute(sql`delete from auth.users where id in (${ALICE}, ${BOB})`); // cascades
  await client.end();
});

describe("withUser", () => {
  it("baseline: the raw connection bypasses RLS (this is why withUser exists)", async () => {
    const rows = await db.select().from(recipes).where(sql`${recipes.ownerId} in (${ALICE}, ${BOB})`);
    expect(rows).toHaveLength(2);
  });

  it("only returns the user's own rows", async () => {
    const rows = await withUser(db, ALICE, (tx) => tx.select().from(recipes));
    expect(rows.map((r) => r.title)).toEqual(["Alice cake"]);
  });

  it("cannot update another user's rows", async () => {
    const updated = await withUser(db, ALICE, (tx) =>
      tx.update(recipes).set({ title: "pwned" }).where(eq(recipes.ownerId, BOB)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("rejects inserting a row owned by someone else", async () => {
    await expect(
      withUser(db, ALICE, (tx) => tx.insert(recipes).values({ ownerId: BOB, title: "x", sourceType: "manual" })),
    ).rejects.toThrow();
  });

  it("does not leak the role or claims to the next query on the connection", async () => {
    await withUser(db, ALICE, (tx) => tx.select().from(recipes));
    const [row] = await db.execute<{ role: string; claims: string | null }>(
      sql`select current_user as role, current_setting('request.jwt.claims', true) as claims`,
    );
    expect(row.role).toBe("postgres");
    expect(row.claims || null).toBeNull();
  });
});
