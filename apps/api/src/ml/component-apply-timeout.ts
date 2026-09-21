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
} from './intelligence-findings/apply-timeout';

/**
 * Bounded execution for the Component Intelligence apply transaction.
 *
 * Pass 6. `ComponentReviewApplyService` has the same transaction shape as the
 * attribute apply path — a row-locked finding, domain repositories bound to the
 * transaction, a guarded transition, a feedback row — and had none of the bounds.
 * The deadlock class Pass 4 found and Pass 5 hardened against is not
 * attribute-specific: the same stray `db.` in a participating repository would
 * pin a connection and hang the request forever, because PostgreSQL has no default
 * `lock_timeout` or `statement_timeout`.
 *
 * Configuration is deliberately separate from the attribute scope
 * (`COMPONENT_INTELLIGENCE_APPLY_*` vs `ATTRIBUTE_INTELLIGENCE_APPLY_*`) so an
 * operator can bound one path without bounding the other. The two paths have
 * different work profiles: the component transaction is larger — it may run
 * `SaveComponentAttributes`, which writes several rows and consults unit
 * conversion and validation — so its defaults are more generous than the
 * attribute path's.
 */

/** Environment variable names, following the project's `UPPER_SNAKE` convention. */
export const COMPONENT_APPLY_LOCK_TIMEOUT_ENV =
  'COMPONENT_INTELLIGENCE_APPLY_LOCK_TIMEOUT_MS';
export const COMPONENT_APPLY_STATEMENT_TIMEOUT_ENV =
  'COMPONENT_INTELLIGENCE_APPLY_STATEMENT_TIMEOUT_MS';

/**
 * Default lock wait: 5 seconds.
 *
 * The same reasoning as the attribute path. The transaction locks one finding row
 * and then touches a component, and possibly a manufacturer, category, attribute
 * definition or option — all by primary key or unique index. A competing apply of
 * the same finding is refused by the guarded transition rather than by the lock,
 * so the only realistic wait is another writer on an overlapping component.
 */
export const DEFAULT_COMPONENT_APPLY_LOCK_TIMEOUT_MS = 5_000;

/**
 * Default statement budget: 20 seconds.
 *
 * Larger than the attribute path's 15 s because this transaction does more: an
 * attribute-value apply runs the full `SaveComponentAttributes` use case, which
 * validates the value against its definition, converts units and writes the
 * component's attribute rows. Twenty seconds is still a hard ceiling that
 * guarantees a pinned connection is released, which is the point of the bound.
 */
export const DEFAULT_COMPONENT_APPLY_STATEMENT_TIMEOUT_MS = 20_000;

/** The component apply path's timeout scope. */
export const COMPONENT_APPLY_TIMEOUT_SCOPE: ApplyTimeoutScope = {
  name: 'component',
  lockTimeoutEnv: COMPONENT_APPLY_LOCK_TIMEOUT_ENV,
  statementTimeoutEnv: COMPONENT_APPLY_STATEMENT_TIMEOUT_ENV,
  defaultLockTimeoutMs: DEFAULT_COMPONENT_APPLY_LOCK_TIMEOUT_MS,
  defaultStatementTimeoutMs: DEFAULT_COMPONENT_APPLY_STATEMENT_TIMEOUT_MS,
};

/** Re-exported so the apply service imports its bounds from one place. */
export type { ApplyTimeoutConfig };

/** Reads the component apply bounds, falling back to the defaults above. */
export function resolveComponentApplyTimeouts(
  env: NodeJS.ProcessEnv = process.env,
): ApplyTimeoutConfig {
  return resolveApplyTimeouts(COMPONENT_APPLY_TIMEOUT_SCOPE, env);
}

/** Applies the component bounds to the current transaction. */
export function applyComponentTransactionTimeouts(
  executor: DbExecutor,
  config: ApplyTimeoutConfig = resolveComponentApplyTimeouts(),
): Promise<void> {
  return applyTransactionTimeouts(executor, config);
}

/**
 * Raised when the component apply transaction exceeded its configured bound.
 *
 * Carries the component apply path's own conflict reason — `APPLY_TIMEOUT` in
 * `APPLY_CONFLICT_REASONS` — so it is distinguishable from `COMPONENT_CHANGED`,
 * `FINGERPRINT_MISMATCH` and the other state refusals on the same route. This is
 * the one refusal on the route that a client should retry unchanged.
 */
export class ComponentApplyTimeoutError extends ConflictException {
  constructor(
    message: string,
    public readonly detail: {
      timeout: ApplyTimeoutKind;
      limitMs: number;
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
 * Classifies a thrown error as a component apply timeout, or as something else.
 *
 * Returns `null` for anything that is not one of the two timeout SQLSTATEs, so the
 * caller keeps its own handling for domain refusals and unexpected failures — a
 * `ComponentAttributeValidationError` or a unique violation must never be reported
 * as a retryable timeout.
 */
export function classifyComponentApplyTimeout(
  error: unknown,
  config: ApplyTimeoutConfig = resolveComponentApplyTimeouts(),
): ComponentApplyTimeoutError | null {
  if (error instanceof ComponentApplyTimeoutError) return error;

  const descriptor: ApplyTimeoutDescriptor | null = describeApplyTimeout(
    error,
    config,
    COMPONENT_APPLY_TIMEOUT_SCOPE,
  );
  if (!descriptor) return null;

  return new ComponentApplyTimeoutError(descriptor.message, {
    timeout: descriptor.kind,
    limitMs: descriptor.limitMs,
    elapsedMs: descriptor.limitMs,
  });
}
