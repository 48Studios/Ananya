import type { TimeEntryDto, TimeEntryStatus } from "./api/time-entries-api";

/**
 * A timesheet row as the UI displays it.
 *
 * The API returns `userId`/`taskId`, not names, and the timesheet's totals must
 * be computed from `hours` (the previous UI summed a field the API never
 * returned, so every total was `0`).
 */
export interface TimeEntryRow {
  id: string;
  employeeLabel: string | null;
  taskLabel: string | null;
  description: string | null;
  hours: number;
  workDate: string;
  status: TimeEntryStatus;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function hoursOf(value: number | undefined | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toTimeEntryRow(
  entry: TimeEntryDto,
  labels?: {
    userNames?: ReadonlyMap<string, string>;
    taskTitles?: ReadonlyMap<string, string>;
  },
): TimeEntryRow {
  return {
    id: entry.id,
    employeeLabel: clean(labels?.userNames?.get(entry.userId)) ?? null,
    taskLabel: clean(labels?.taskTitles?.get(entry.taskId)) ?? null,
    description: clean(entry.description),
    hours: hoursOf(entry.hours),
    workDate: entry.date,
    status: entry.status,
  };
}

export function buildTimeEntryRows(
  entries: TimeEntryDto[] | undefined | null,
  labels?: {
    userNames?: ReadonlyMap<string, string>;
    taskTitles?: ReadonlyMap<string, string>;
  },
): TimeEntryRow[] {
  if (!entries?.length) return [];
  return entries.map((entry) => toTimeEntryRow(entry, labels));
}

export function sumLoggedHours(rows: TimeEntryRow[]): number {
  const total = rows.reduce((sum, row) => sum + (row.hours || 0), 0);
  return Math.round(total * 100) / 100;
}

export function toUserLabelMap(
  users:
    | Array<{ id: string; firstName?: string; lastName?: string; email?: string }>
    | undefined
    | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const user of users ?? []) {
    const fullName = clean(`${user.firstName ?? ""} ${user.lastName ?? ""}`);
    const label = fullName ?? clean(user.email);
    if (label) map.set(user.id, label);
  }
  return map;
}

export function toTaskTitleMap(
  tasks: Array<{ id: string; title?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const task of tasks ?? []) {
    const title = clean(task.title);
    if (title) map.set(task.id, title);
  }
  return map;
}
