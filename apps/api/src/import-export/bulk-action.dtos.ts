import { BulkActionType } from './dtos';

/**
 * What happened to one selected record.
 *
 * `SKIPPED` is a refusal, not an error: the record was left untouched because a
 * domain rule (or a not-found check) said no, and `reason` says which. `FAILED`
 * means the write itself did not complete.
 */
export type BulkActionOutcome = 'APPLIED' | 'SKIPPED' | 'FAILED';

export interface BulkActionItemResult {
  id: string;
  outcome: BulkActionOutcome;
  /** Why the record was skipped or failed; `null` when it was applied. */
  reason: string | null;
}

export interface BulkActionResultDto {
  entityType: string;
  action: BulkActionType;
  requestedCount: number;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  results: BulkActionItemResult[];
}

export interface BulkActionSupportDto {
  entityType: string;
  supportedActions: BulkActionType[];
}
