import { asc, sql } from "drizzle-orm";
import type { Pan } from "@/lib/culinary";
import type { Db } from "./client";
import { pans } from "./schema";
import { withUser } from "./withUser";

export interface PanOption extends Pan {
  label: string;
  mine: boolean;
}

const n = (v: string | null) => (v === null ? null : Number(v));

/** Presets plus the user's own pans. */
export async function listPans(db: Db, userId: string): Promise<PanOption[]> {
  const rows = await withUser(db, userId, (tx) =>
    tx.select().from(pans).orderBy(sql`${pans.ownerId} is not null`, asc(pans.label)),
  );
  return rows.map((p) => ({
    id: p.id,
    label: p.label,
    mine: p.ownerId !== null,
    shape: p.shape,
    diameterCm: n(p.diameterCm),
    widthCm: n(p.widthCm),
    lengthCm: n(p.lengthCm),
    depthCm: n(p.depthCm),
    volumeMl: n(p.volumeMl),
    cupCount: p.cupCount,
  }));
}
