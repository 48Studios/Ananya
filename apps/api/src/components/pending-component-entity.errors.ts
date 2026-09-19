import { DomainError } from '@ananya/core';

export class PendingComponentEntityConflictError extends DomainError {
  constructor(entity: 'manufacturer' | 'category') {
    super(
      `${entity} ID and pending ${entity} cannot both be provided in the same request.`,
    );
  }
}

export class InvalidPendingComponentEntityError extends DomainError {
  constructor(entity: 'manufacturer' | 'category') {
    super(`Pending ${entity} name is required.`);
  }
}
