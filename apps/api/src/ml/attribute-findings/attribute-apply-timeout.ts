import { ConflictException } from '@nestjs/common';
import type { DbExecutor } from '@ananya/database';
import {
  applyTransactionTimeouts,
  describeApplyTimeout,
  resolveApplyTimeouts,
  type ApplyTimeoutConfig,
  type ApplyTimeoutDescriptor,
  type ApplyTimeoutKind,
  type ApplyTimeoutScope,
} from '../intelligence-findings/apply-timeout';

/**
 * Re-exported so the attribute apply service keeps importing its bounds from one
 * place. The implementations live in the shared module; these names are the
 * attribute path's view of them.
 */
export {
  applyTransactionTimeouts,
  resolveApplyTimeouts,
  type ApplyTimeoutConfig,
};

/**
 * Bounded execution for the Attribute Intelligence apply transaction.
 *
 * The mechanism lives in `../intelligence-findings/apply-timeout`; this module is
 * the attribute-scoped binding: the environment variables, the defaults, and the
 * error class that carries the attribute conflict vocabulary.
 *
 * Why the bounds exist: Pass 4 found a real deadlock in this path. A repository
 * bound to the global client instead of the transaction executor inserted on a
 * second pooled connection, and its foreign-key check blocked on the row lock the
 * transaction itself was holding. PostgreSQL has no default `lock_timeout` or
 * `statement_timeout`, so nothing bounded the wait: the request hung indefinitely
 * with a connection and a transaction pinned, which is worse than a failed apply.
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

/** The attribute apply path's timeout scope. */
export const ATTRIBUTE_APPLY_TIMEOUT_SCOPE: ApplyTimeoutScope = {
  name: 'attribute',
  lockTimeoutEnv: APPLY_LOCK_TIMEOUT_ENV,
  statementTimeoutEnv: APPLY_STATEMENT_TIMEOUT_ENV,
  defaultLockTimeoutMs: DEFAULT_APPLY_LOCK_TIMEOUT_MS,
  defaultStatementTimeoutMs: DEFAULT_APPLY_STATEMENT_TIMEOUT_MS,
};

/** Reads the attribute apply bounds, falling back to the defaults above. */
export function resolveAttributeApplyTimeouts(
  env: NodeJS.ProcessEnv = process.env,
): ApplyTimeoutConfig {
  return resolveApplyTimeouts(ATTRIBUTE_APPLY_TIMEOUT_SCOPE, env);
}

/** Applies the attribute bounds to the current transaction. */
export function applyAttributeTransactionTimeouts(
  executor: DbExecutor,
  config: ApplyTimeoutConfig = resolveAttributeApplyTimeouts(),
): Promise<void> {
  return applyTransactionTimeouts(executor, config);
}

/**
 * Raised when the attribute apply transaction exceeded its configured bound.
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
      timeout: ApplyTimeoutKind;
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
 * Classifies a thrown error as an attribute apply timeout, or as something else.
 *
 * Returns `null` for anything that is not one of the two timeout SQLSTATEs, so the
 * caller keeps its own handling for domain refusals and unexpected failures.
 */
export function classifyApplyTimeout(
  error: unknown,
  config: ApplyTimeoutConfig = resolveAttributeApplyTimeouts(),
): AttributeApplyTimeoutError | null {
  if (error instanceof AttributeApplyTimeoutError) return error;

  const descriptor: ApplyTimeoutDescriptor | null = describeApplyTimeout(
    error,
    config,
    ATTRIBUTE_APPLY_TIMEOUT_SCOPE,
  );
  if (!descriptor) return null;

  return new AttributeApplyTimeoutError(descriptor.message, {
    timeout: descriptor.kind,
    limitMs: descriptor.limitMs,
    elapsedMs: descriptor.limitMs,
  });
}
