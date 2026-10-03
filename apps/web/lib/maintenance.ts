import type {
  MaintenanceScheduleDto,
  MaintenanceStatus,
  ServiceFrequency,
} from "./api/maintenance-api";

/**
 * A maintenance schedule as the UI displays it.
 *
 * The domain records a service frequency and a next visit date — there is no
 * work centre, no task type and no "last completed" date, so the UI must not
 * pretend otherwise. Customer names come from the customers API.
 */
export interface MaintenanceRow {
  id: string;
  scheduleNumber: string;
  assetLabel: string;
  assetSubLabel: string | null;
  frequency: ServiceFrequency;
  nextVisitDate: string;
  assignedTechnician: string | null;
  customerName: string | null;
  status: MaintenanceStatus;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toMaintenanceRow(
  schedule: MaintenanceScheduleDto,
  customerNames?: ReadonlyMap<string, string>,
): MaintenanceRow {
  return {
    id: schedule.id,
    scheduleNumber: clean(schedule.scheduleNumber) ?? "-",
    assetLabel: clean(schedule.assetName) ?? "-",
    assetSubLabel: clean(schedule.serialNumber),
    frequency: schedule.frequency,
    nextVisitDate: schedule.nextVisitDate,
    assignedTechnician: clean(schedule.assignedTechnician),
    customerName: clean(customerNames?.get(schedule.customerId)) ?? null,
    status: schedule.status,
  };
}

export function buildMaintenanceRows(
  schedules: MaintenanceScheduleDto[] | undefined | null,
  customerNames?: ReadonlyMap<string, string>,
): MaintenanceRow[] {
  if (!schedules?.length) return [];
  return schedules.map((schedule) => toMaintenanceRow(schedule, customerNames));
}

export const FREQUENCY_LABELS: Record<ServiceFrequency, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  BIANNUAL: "Biannual",
  ANNUAL: "Annual",
};
