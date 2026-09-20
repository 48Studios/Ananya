/**
 * Postgres driver error inspection for Ananya persistence code.
 *
 * Drizzle wraps every driver failure in its own error and keeps the original
 * Postgres error on `cause` (see `DrizzleQueryError` in `drizzle-orm/errors`).
 * Reading `code` straight off the thrown error therefore never works, which
 * silently disables constraint-violation translation in repositories.
 */

export const POSTGRES_UNIQUE_VIOLATION = '23505';
export const POSTGRES_FOREIGN_KEY_VIOLATION = '23503';

/** Bounded walk: drizzle wraps once today, the limit only guards bad chains. */
const MAX_CAUSE_DEPTH = 5;

function readCode(candidate: unknown): string | undefined {
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  const code = (candidate as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function readCause(candidate: unknown): unknown {
  if (typeof candidate !== 'object' || candidate === null) return undefined;
  return (candidate as { cause?: unknown }).cause;
}

/**
 * Returns the SQLSTATE carried by the error, unwrapping the
 * Drizzle/pg error chain. Returns `undefined` for non-Postgres errors.
 */
export function getPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
    const code = readCode(current);
    if (code) return code;

    const cause = readCause(current);
    if (cause === undefined || cause === current) return undefined;
    current = cause;
  }

  return undefined;
}

export function isPostgresErrorCode(error: unknown, code: string): boolean {
  return getPostgresErrorCode(error) === code;
}
