import type { drizzle } from "drizzle-orm/node-postgres";

/** The root Drizzle client type. */
export type DbClient = ReturnType<typeof drizzle>;

/**
 * The handle a `db.transaction(async (tx) => ...)` callback receives.
 *
 * Drizzle's transaction handle exposes the same query builder surface as the
 * root client but is a distinct type, because the transaction owns the
 * connection and controls commit/rollback.
 */
export type DbTransaction = Parameters<
  Parameters<DbClient["transaction"]>[0]
>[0];

/**
 * A database executor: either the root client or a caller-owned transaction.
 *
 * Repositories that must participate in a multi-subsystem atomic operation
 * accept a `DbExecutor` through their constructor, defaulting to the global
 * client so every existing caller keeps working unchanged.
 *
 * Why this exists: Pass 6A found that component consolidation could not be made
 * atomic because each repository bound the global `db`, so a failure halfway
 * through would leave partially migrated state. Routing every participating
 * repository through one shared executor is what makes the consolidation
 * operation all-or-nothing.
 *
 * Usage:
 *
 * ```ts
 * await db.transaction(async (tx) => {
 *   const executor = toDbExecutor(tx);
 *   const components = new DrizzleComponentRepository(executor);
 *   // ... every participating repository receives the SAME executor
 * });
 * ```
 */
export type DbExecutor = DbClient;

/**
 * Narrows a transaction handle to a `DbExecutor`.
 *
 * Drizzle types the transaction handle separately from the root client even
 * though the query-building surface used by these repositories is identical.
 * The cast is confined to this one function so no repository or service has to
 * repeat it, and so the assumption is documented in exactly one place: every
 * repository in this codebase calls only `select` / `insert` / `update` /
 * `delete` / `execute` on its client, all of which the transaction handle
 * implements with the same signatures and the same transaction-scoped
 * connection.
 *
 * The alternative — typing repositories against a union — would force every
 * query builder chain to be re-narrowed at each call site for no runtime
 * benefit, because the two types differ only in their phantom transaction
 * marker.
 */
export function toDbExecutor(tx: DbTransaction): DbExecutor {
  return tx as unknown as DbExecutor;
}
