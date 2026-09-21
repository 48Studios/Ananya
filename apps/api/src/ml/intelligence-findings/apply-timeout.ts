import type { DbExecutor } from '@ananya/database';
import { sql } from '@ananya/database/query';

/**
 * Shared, transaction-local execution bounds for intelligence apply paths.
 *
 * Extracted in Pass 6 from `attribute-apply-timeout.ts`, which Pass 4/5 wrote for
 * the Attribute apply transaction alone. `ComponentReviewApplyService` has the
 * same transaction shape — a row-locked finding, domain repositories bound to the
 * transaction, a guarded transition and a feedback row — and none of the bounds,
 * so it was exposed to the identical failure mode the attribute path was hardened
 * against.
 *
 * What is shared is the MECHANISM, not the policy:
 *
 *  - `set_config(..., true)` is `SET LOCAL`: it applies to the enclosing
 *    transaction and reverts on commit or rollback, so a bound can never leak onto
 *    a pooled connection.
 *  - The SQLSTATE walk, because Drizzle wraps driver failures in
 *    `DrizzleQueryError` and puts the code on `cause`.
 *  - The classification rule: only the two timeout codes qualify.
 *
 * What is NOT shared is the vocabulary and the configuration. Each apply path
 * declares its own {@link ApplyTimeoutScope} — its own environment variables, its
 * own defaults and its own error class — because the two paths have separate
 * conflict-reason types and an operator needs to be able to bound one without
 * bounding the other.
 *
 * There is deliberately still no global database timeout: the rest of the API's
 * query surface has different latency expectations, and a global statement timeout
 * would turn long legitimate reports into errors.
 */

/** Environment-variable names and defaults for one apply path. */
export interface ApplyTimeoutScope {
  /** Path name used in operator-facing messages, e.g. `attribute`. */
  readonly name: string;
  readonly lockTimeoutEnv: string;
  readonly statementTimeoutEnv: string;
  readonly defaultLockTimeoutMs: number;
  readonly defaultStatementTimeoutMs: number;
}

/** The bounds in force for one apply path. */
export interface ApplyTimeoutConfig {
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

/** Which bound fired. */
export type ApplyTimeoutKind = 'LOCK_TIMEOUT' | 'STATEMENT_TIMEOUT';

/**
 * A classified timeout, before it becomes an HTTP exception.
 *
 * Deliberately a plain value rather than an exception: the shared module must not
 * decide what an apply path throws, because each path has its own conflict-reason
 * type and its own wording. Each scope turns this into its own error.
 */
export interface ApplyTimeoutDescriptor {
  kind: ApplyTimeoutKind;
  limitMs: number;
  message: string;
}

/**
 * PostgreSQL error codes that mean "this statement was stopped by a timeout".
 *
 * `55P03` is raised by `lock_timeout` (lock not available); `57014` is raised by
 * `statement_timeout` (query canceled). Both are the database refusing to wait
 * rather than a defect in the statement, which is why they — and only they — are
 * reported as a retryable conflict.
 */
export const TIMEOUT_SQLSTATE_CODES = ['55P03', '57014'] as const;

/**
 * An unparseable or non-positive value falls back to the default rather than
 * disabling the bound: a typo in an environment variable must not silently
 * reintroduce an unbounded wait.
 */
function readPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

/** Reads the bounds for one scope, falling back to its defaults. */
export function resolveApplyTimeouts(
  scope: ApplyTimeoutScope,
  env: NodeJS.ProcessEnv = process.env,
): ApplyTimeoutConfig {
  return {
    lockTimeoutMs: readPositiveInt(
      env[scope.lockTimeoutEnv],
      scope.defaultLockTimeoutMs,
    ),
    statementTimeoutMs: readPositiveInt(
      env[scope.statementTimeoutEnv],
      scope.defaultStatementTimeoutMs,
    ),
  };
}

/**
 * Applies the bounds to the current transaction.
 *
 * `SET LOCAL` is scoped to the enclosing transaction and reverts on commit or
 * rollback, so this cannot leak onto the pooled connection. The values are
 * integers derived from configuration and are passed as bind parameters, not
 * concatenated — `set_config` accepts the value as a parameter, unlike a literal
 * `SET LOCAL`, so the number is never interpolated into SQL text.
 */
export async function applyTransactionTimeouts(
  executor: DbExecutor,
  config: ApplyTimeoutConfig,
): Promise<void> {
  await executor.execute(
    sql`select set_config('lock_timeout', ${`${config.lockTimeoutMs}ms`}, true)`,
  );
  await executor.execute(
    sql`select set_config('statement_timeout', ${`${config.statementTimeoutMs}ms`}, true)`,
  );
}

/**
 * Reads a PostgreSQL `SQLSTATE` from an error of unknown shape.
 *
 * Drizzle wraps driver failures in `DrizzleQueryError`, so the code lives on
 * `cause` rather than on the thrown object — verified against the driver rather
 * than assumed. Both are checked, and the walk is depth-limited because a `cause`
 * chain is unbounded in principle.
 */
export function readSqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string' && code.length > 0) return code;
      current = (current as { cause?: unknown }).cause;
    } else {
      return null;
    }
  }
  return null;
}

/** Whether a SQLSTATE means the database refused to wait. */
export function isTimeoutSqlState(code: string): boolean {
  return (TIMEOUT_SQLSTATE_CODES as readonly string[]).includes(code);
}

/**
 * Classifies a thrown error as a timeout, or as something else entirely.
 *
 * Only the two timeout SQLSTATEs qualify. A unique violation, a foreign-key
 * violation, a domain refusal or an unexpected driver failure must all remain
 * visible as genuine failures — reporting one of those as a retryable timeout
 * would tell a client to retry an operation that will fail identically, and would
 * hide a real defect behind a transient-sounding message.
 *
 * Returns `null` when the error is not a timeout, so a caller can fall through to
 * its own error handling with the original error intact.
 */
export function describeApplyTimeout(
  error: unknown,
  config: ApplyTimeoutConfig,
  scope: ApplyTimeoutScope,
): ApplyTimeoutDescriptor | null {
  const code = readSqlState(error);
  if (code === null) return null;
  if (!isTimeoutSqlState(code)) return null;

  const isLockTimeout = code === '55P03';
  const limitMs = isLockTimeout
    ? config.lockTimeoutMs
    : config.statementTimeoutMs;

  return {
    kind: isLockTimeout ? 'LOCK_TIMEOUT' : 'STATEMENT_TIMEOUT',
    limitMs,
    message: isLockTimeout
      ? `Could not lock the rows this ${scope.name} application needs within ${limitMs}ms: another change to the same data is in progress. Nothing was changed — retry the application.`
      : `The ${scope.name} application exceeded its ${limitMs}ms statement budget and was cancelled. Nothing was changed — retry the application.`,
  };
}
