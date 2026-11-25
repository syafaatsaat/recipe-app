import { customType } from "drizzle-orm/pg-core";

/** Postgres tsvector (read-only generated column in this app). */
export const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});
