import type { MrpRunRecordDto, WorkCenterCapacityDto } from "./api/mrp-api";
import type { PlanningMessageDto } from "./api/planning-messages-api";
import { formatDate } from "./formatters";

/**
 * Presentation rules for MRP runs.
 *
 * The API returns domain fields directly; these helpers keep the list and
 * detail pages from inventing values when a field is missing. A missing
 * horizon is "—", never "0 days"; a missing completion timestamp is never
 * displayed as if the run finished.
 */

export type PlanningMessageSeverity = "INFO" | "WARNING" | "ERROR";

export interface PlanningMessageRow {
  id: string;
  severity: PlanningMessageSeverity;
  message: string;
  createdAt: string;
}

const MESSAGE_SEVERITIES: readonly PlanningMessageSeverity[] = [
  "INFO",
  "WARNING",
  "ERROR",
];

/**
 * Keeps only rows that carry a real severity and message. A run's log table
 * must never render placeholder rows with blank severity/message cells; if no
 * row survives, the table shows its empty state instead.
 */
export function normalizePlanningMessages(
  messages: PlanningMessageDto[] | null | undefined,
): PlanningMessageRow[] {
  if (!Array.isArray(messages)) return [];

  const rows: PlanningMessageRow[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;

    const severity = message.severity as PlanningMessageSeverity | undefined;
    if (!severity || !MESSAGE_SEVERITIES.includes(severity)) continue;

    const text =
      typeof message.message === "string" ? message.message.trim() : "";
    if (!text) continue;

    rows.push({
      id: typeof message.id === "string" && message.id ? message.id : text,
      severity,
      message: text,
      createdAt: typeof message.createdAt === "string" ? message.createdAt : "",
    });
  }

  return rows;
}

export function formatRunStatus(
  status: MrpRunRecordDto["status"] | null | undefined,
): string {
  return typeof status === "string" && status.trim() ? status : "UNKNOWN";
}

export function formatRunHorizon(
  horizonDays: number | null | undefined,
): string {
  if (
    typeof horizonDays !== "number" ||
    !Number.isFinite(horizonDays) ||
    horizonDays <= 0
  ) {
    return "—";
  }
  return `${horizonDays} ${horizonDays === 1 ? "day" : "days"}`;
}

export function formatRunCreatedAt(
  run: Pick<MrpRunRecordDto, "createdAt"> | null | undefined,
): string {
  return formatDate(run?.createdAt ?? null);
}

/**
 * A completion timestamp only exists for a finished run. Runs that are still
 * pending are labelled as such; cancelled runs are not shown as if they would
 * complete later.
 */
export function formatRunCompletedAt(
  run: Pick<MrpRunRecordDto, "status" | "completedAt"> | null | undefined,
): string {
  if (!run) return "—";
  if (run.completedAt) return formatDate(run.completedAt);
  if (run.status === "DRAFT" || run.status === "RUNNING") return "Pending";
  return "—";
}

export interface CapacityPlanRecord {
  id: string;
  planningRunId: string;
  workCenterId: string;
  workCenterName: string;
  availableCapacityHours: number | string;
  plannedCapacityHours: number | string;
  utilizationPercentage: number | string;
  isOverloaded: boolean;
}

function asNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toWorkCenterCapacityDto(
  record: CapacityPlanRecord,
): WorkCenterCapacityDto {
  const utilization = asNumber(record.utilizationPercentage);
  return {
    id: record.id,
    workCenterCode: record.workCenterId,
    name: record.workCenterName,
    availableHoursWeekly: asNumber(record.availableCapacityHours),
    allocatedHoursWeekly: asNumber(record.plannedCapacityHours),
    utilizationPercentage: utilization,
    isOverloaded: record.isOverloaded === true || utilization > 100,
  };
}

export function normalizeCapacityPlans(
  records: CapacityPlanRecord[] | null | undefined,
): WorkCenterCapacityDto[] {
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === "object")
    .map(toWorkCenterCapacityDto);
}
