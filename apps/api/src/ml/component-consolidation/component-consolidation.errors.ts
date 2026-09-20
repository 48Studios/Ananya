import { ConflictException, BadRequestException } from '@nestjs/common';

/**
 * Raised when a consolidation request is refused for a state reason.
 *
 * Carries a machine-readable `reason` so the client can react without parsing
 * prose. Thrown inside the consolidation transaction, it rolls everything back:
 * nothing is mutated when this error escapes.
 */
export class ConsolidationConflictError extends ConflictException {
  constructor(
    public readonly reason: ConsolidationConflictReason,
    message: string,
    /** The conflicts that blocked execution, when there are any. */
    public readonly conflicts: Array<{
      code: string;
      title: string;
      description: string;
    }> = [],
  ) {
    super({ statusCode: 409, reason, message, conflicts });
  }
}

export type ConsolidationConflictReason =
  | 'FINDING_NOT_FOUND'
  | 'FINDING_STATUS_NOT_CONSOLIDATABLE'
  | 'FINDING_NOT_DUPLICATE'
  | 'FINGERPRINT_MISMATCH'
  | 'COMPONENT_NOT_FOUND'
  | 'COMPONENT_NOT_IN_FINDING'
  | 'SOURCE_NOT_ACTIVE'
  | 'CANONICAL_NOT_ACTIVE'
  | 'SOURCE_ALREADY_CONSOLIDATED'
  | 'CANONICAL_ALREADY_CONSOLIDATED'
  | 'SELF_CONSOLIDATION'
  | 'CONFIRMATION_REQUIRED'
  | 'BLOCKING_CONFLICTS'
  | 'RESOLUTION_INVALID'
  | 'UNIT_MISMATCH'
  | 'ALREADY_CONSOLIDATED';

/** Raised when the submitted plan is malformed or not applicable. */
export class ConsolidationPlanError extends BadRequestException {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super({
      statusCode: 400,
      error: 'ConsolidationPlanInvalid',
      message,
      field,
    });
  }
}

/**
 * Raised when an adapter finds that a domain it owns cannot be migrated
 * safely at execution time.
 *
 * This is the "favor an explicit blocker over clever automation" path: the
 * adapter refuses and the whole transaction rolls back rather than applying a
 * partial migration.
 */
export class ConsolidationAdapterBlockedError extends ConflictException {
  constructor(
    public readonly adapterId: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super({
      statusCode: 409,
      reason: 'ADAPTER_BLOCKED',
      adapterId,
      message,
      details,
    });
  }
}
