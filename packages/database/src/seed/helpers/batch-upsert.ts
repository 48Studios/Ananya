import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<Record<string, never>>;

export async function upsertBatch<T extends Record<string, unknown>>(
  db: Db,
  table: PgTable,
  rows: T[],
  conflictTarget: unknown,
  updateSet: Record<string, unknown>,
  chunkSize = 250,
): Promise<void> {
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db
      .insert(table)
      .values(chunk as never[])
      .onConflictDoUpdate({
        target: conflictTarget as never,
        set: updateSet,
      });
  }
}

export async function insertBatch<T extends Record<string, unknown>>(
  db: Db,
  table: PgTable,
  rows: T[],
  chunkSize = 250,
): Promise<void> {
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await db
      .insert(table)
      .values(chunk as never[])
      .onConflictDoNothing();
  }
}

export { sql };
