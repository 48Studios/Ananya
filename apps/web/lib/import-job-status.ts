import { ImportExportJobDto } from "./api/import-export-api";

export type ImportJobState =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED_SUCCESS"
  | "COMPLETED_PARTIAL"
  | "FAILED"
  | "REVERSED";

export interface ImportJobStateInput {
  status: ImportExportJobDto["status"] | string;
  totalRecords?: number | null;
  processedRecords?: number | null;
  failedRecords?: number | null;
}

/**
 * Checks whether the job has reached a terminal backend status (COMPLETED or FAILED or REVERSED).
 * Processing progress (e.g. progressPercent === 100) MUST NOT be confused with lifecycle termination.
 */
export function isJobTerminal(status: string | undefined | null): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  return upper === "COMPLETED" || upper === "FAILED" || upper === "REVERSED";
}

/**
 * Derives the authoritative UI result category from the backend job status and record metrics.
 *
 * Invariant Rules:
 * - status === 'REVERSED' -> REVERSED
 * - status === 'FAILED' -> FAILED
 * - status === 'COMPLETED' & failedRecords === 0 -> COMPLETED_SUCCESS
 * - status === 'COMPLETED' & processedRecords > 0 & failedRecords > 0 -> COMPLETED_PARTIAL
 * - status === 'COMPLETED' & processedRecords === 0 & failedRecords > 0 -> FAILED
 * - status === 'PROCESSING' -> PROCESSING
 * - status === 'QUEUED' or 'PENDING' -> PENDING
 */
export function deriveImportJobState(job: ImportJobStateInput): ImportJobState {
  const status = (job.status || "").toUpperCase();
  const total = job.totalRecords ?? 0;
  const processed = job.processedRecords ?? 0;
  const failed = job.failedRecords ?? 0;

  if (status === "REVERSED") {
    return "REVERSED";
  }

  if (status === "QUEUED" || status === "PENDING") {
    return "PENDING";
  }

  if (status === "PROCESSING") {
    return "PROCESSING";
  }

  if (status === "FAILED") {
    return "FAILED";
  }

  if (status === "COMPLETED") {
    if (failed > 0 && processed === 0) {
      return "FAILED";
    }
    if (failed > 0 && processed > 0) {
      return "COMPLETED_PARTIAL";
    }
    return "COMPLETED_SUCCESS";
  }

  // Fallback for unexpected status string: if all records failed, report FAILED
  if (failed > 0 && processed === 0 && total > 0) {
    return "FAILED";
  }

  return "FAILED";
}
