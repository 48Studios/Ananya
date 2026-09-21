import { ConflictException } from '@nestjs/common';
import type { DbExecutor } from '@ananya/database';
import { sql } from '@ananya/database/query';

/**
 * Bounded execution for the Attribute Intelligence apply transaction.
 *
 * Why this exists: Pass 4 found a real deadlock in this path. A repository bound
 * to the global client instead of the transaction executor inserted on a second
 * pooled connection, and its foreign-key check blocked on the row lock the
 * transaction itself was holding. PostgreSQL has no default `lock_timeout` or
 * `statement_timeout`, so nothing bounded the wait: the request hung indefinitely
 * with a connection and a transaction pinned, which is worse than a failed apply.
 *
 * The settings below are transaction-local (`SET LOCAL`), so they apply to the
 * apply transaction and to nothing else. There is deliberately no global timeout
 * framework here: the rest of the API's query surface has different latency
 * expectations, and a global statement timeout would turn long legitimate reports
 * into errors. This is a bounded blast radius for one mutation, not a policy.
 *
 * Two distinct limits, because they catch different failures:
 *
 *  - `lock_timeout` bounds waiting to ACQUIRE a lock. This is the deadlock and
 *    contention case, and it is the one that should fire quickly: if a row cannot
 *    be locked in a moment, the reviewer should retry rather than hold a
 *    connection.
 *  - `statement_timeout` bounds a single statement's total execution. It is the
 *    backstop for a statement that acquires its locks and then runs long.
 */

/** Environment variable names, following the project's `UPPER_SNAKE` convention. */
export const APPLY_LOCK_TIMEOUT_ENV =
  'ATTRIBUTE_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS';
export const APPLY_STATEMENT_TIMEOUT_ENV =
  'ATTRIBUTE_INTELLIGENCE_APPLY_STATEMENT_TIMEOUT_MS';

/**
 * Default lock wait: 5 seconds.
 *
 * Chosen from what the apply path actually does. It locks one finding row, one
 * attribute, one category and at most one binding — all by primary key or by a
 * unique index — and holds them for a handful of statements. A competing apply of
 * the same finding is refused by the guarded update rather than by the lock, so
 * the only realistic wait is another reviewer applying an overlapping finding.
 * Five seconds is far longer than that legitimate case needs and far shorter than
 * a human's patience, which is the right side to err on for a lock wait.
 */
export const DEFAULT_APPLY_LOCK_TIMEOUT_MS = 5_000;

/**
 * Default statement budget: 15 seconds.
 *
 * The apply transaction is a fixed, small number of single-row statements; the
 * whole thing completes in single-digit milliseconds on the dev database. Fifteen
 * seconds is a generous ceiling that still guarantees a pinned connection is
 * released, rather than the unbounded wait that produced the Pass 4 hang.
 */
export const DEFAULT_APPLY_STATEMENT_TIMEOUT_MS = 15_000;

/**
 * The timeouts in force, resolved once at module load.
 *
 * An unparseable or non-positive value falls back to the default rather than
 * disabling the bound: a typo in an environment variable must not silently
 * reintroduce an unbounded wait.
 */
export interface ApplyTimeoutConfig {
  lockTimeoutMs: number;
  statementTimeoutMs: number;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function resolveApplyTimeouts(
  env: NodeJS.ProcessEnv = process.env,
): ApplyTimeoutConfig {
  return {
    lockTimeoutMs: readPositiveInt(
      env[APPLY_LOCK_TIMEOUT_ENV],
      DEFAULT_APPLY_LOCK_TIMEOUT_MS,
    ),
    statementTimeoutMs: readPositiveInt(
      env[APPLY_STATEMENT_TIMEOUT_ENV],
      DEFAULT_APPLY_STATEMENT_TIMEOUT_MS,
    ),
  };
}

/**
 * Applies the bounds to the current transaction.
 *
 * `SET LOCAL` is scoped to the enclosing transaction and reverts on commit or
 * rollback, so this cannot leak onto the pooled connection. The values are
 * integers derived from configuration and are interpolated as parameters, not
 * concatenated — `SET LOCAL` does not accept bind parameters for its value, so
 * the number is inlined, and it is inlined only after being parsed as a finite
 * positive integer.
 */
export async function applyTransactionTimeouts(
  executor: DbExecutor,
  config: ApplyTimeoutConfig = resolveApplyTimeouts(),
): Promise<void> {
  await executor.execute(
    sql`select set_config('lock_timeout', ${`${config.lockTimeoutMs}ms`}, true)`,
  );
  await executor.execute(
    sql`select set_config('statement_timeout', ${`${config.statementTimeoutMs}ms`}, true)`,
  );
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
 * Raised when the apply transaction exceeded its configured bound.
 *
 * Extends `ConflictException` so it follows the same contract as every other
 * refusal on this route: 409 with a machine-readable `reason`, and a body that
 * states the library was not changed. `retryable: true` is the part a client can
 * act on without parsing prose.
 */
export class AttributeApplyTimeoutError extends ConflictException {
  constructor(
    message: string,
    public readonly detail: {
      /** Which bound fired, for the log and for the client's own wording. */
      timeout: 'LOCK_TIMEOUT' | 'STATEMENT_TIMEOUT';
      /** Configured limit in milliseconds. */
      limitMs: number;
      /** How long the statement actually waited before being stopped. */
      elapsedMs: number;
    },
  ) {
    super({
      statusCode: 409,
      reason: 'APPLY_TIMEOUT',
      retryable: true,
      timeout: detail.timeout,
      message,
    });
  }
}

/**
 * Reads a PostgreSQL `SQLSTATE` from an error of unknown shape.
 *
 * Drizzle wraps driver failures in `DrizzleQueryError`, so the code lives on
 * `cause` rather than on the thrown object. Both are checked, and the walk is
 * depth-limited because a `cause` chain is attacker-influenced only in theory but
 * unbounded in practice.
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

/**
 * Classifies a thrown error as a timeout, or as something else entirely.
 *
 * Only the two timeout SQLSTATEs qualify. A unique violation, a foreign-key
 * violation, a domain refusal or an unexpected driver failure must all remain
 * visible as genuine failures — reporting one of those as a retryable timeout
 * would tell a client to retry an operation that will fail identically, and would
 * hide a real defect behind a transient-sounding message.
 */
export function classifyApplyTimeout(
  error: unknown,
  config: ApplyTimeoutConfig = resolveApplyTimeouts(),
): AttributeApplyTimeoutError | null {
  if (error instanceof AttributeApplyTimeoutError) return error;

  const code = readSqlState(error);
  if (code === null) return null;
  if (!(TIMEOUT_SQLSTATE_CODES as readonly string[]).includes(code))
    return null;

  const isLockTimeout = code === '55P03';
  const limitMs = isLockTimeout
    ? config.lockTimeoutMs
    : config.statementTimeoutMs;

  return new AttributeApplyTimeoutError(
    isLockTimeout
      ? `Could not lock the finding's rows within ${limitMs}ms: another change to the same attribute or category is in progress. The attribute library was not changed — retry the application.`
      : `The application exceeded its ${limitMs}ms statement budget and was cancelled. The attribute library was not changed — retry the application.`,
    {
      timeout: isLockTimeout ? 'LOCK_TIMEOUT' : 'STATEMENT_TIMEOUT',
      limitMs,
      elapsedMs: limitMs,
    },
  );
}
