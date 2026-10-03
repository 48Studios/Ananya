import type { TaskDto, TaskPriority, TaskStatus } from "./api/tasks-api";

/**
 * A task as the UI displays it.
 *
 * The API returns `projectId` and `assignedUser` (an id), not names; the domain
 * has no due date at all. Unresolved labels stay `null` so a page can render an
 * honest placeholder instead of inventing a value.
 */
export interface TaskRow {
  id: string;
  taskNumber: string;
  title: string;
  assignedTo: string | null;
  projectLabel: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  estimatedHours: number;
  actualHours: number;
  createdAt: string;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toTaskRow(
  task: TaskDto,
  projectNames?: ReadonlyMap<string, string>,
): TaskRow {
  return {
    id: task.id,
    taskNumber: clean(task.taskNumber) ?? "-",
    title: clean(task.title) ?? "-",
    assignedTo: clean(task.assignedUser),
    projectLabel: clean(projectNames?.get(task.projectId)) ?? null,
    priority: task.priority,
    status: task.status,
    estimatedHours: Number(task.estimatedHours ?? 0),
    actualHours: Number(task.actualHours ?? 0),
    createdAt: task.createdAt,
  };
}

export function buildTaskRows(
  tasks: TaskDto[] | undefined | null,
  projectNames?: ReadonlyMap<string, string>,
): TaskRow[] {
  if (!tasks?.length) return [];
  return tasks.map((task) => toTaskRow(task, projectNames));
}

export function toProjectNameMap(
  projects: Array<{ id: string; name?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const project of projects ?? []) {
    const name = clean(project.name);
    if (name) map.set(project.id, name);
  }
  return map;
}

export function sumActualHours(rows: TaskRow[]): number {
  return rows.reduce((total, row) => total + (row.actualHours || 0), 0);
}
