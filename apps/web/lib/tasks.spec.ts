import { describe, it, expect } from "vitest";
import { buildTaskRows, sumActualHours, toProjectNameMap, toTaskRow } from "./tasks";
import type { TaskDto } from "./api/tasks-api";

const baseTask: TaskDto = {
  id: "task-1",
  taskNumber: "TSK-000007",
  projectId: "proj-1",
  title: "Commission the new conveyor line",
  estimatedHours: 12,
  actualHours: 4.5,
  priority: "HIGH",
  status: "IN_PROGRESS",
  assignments: [],
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "2026-10-02T08:00:00.000Z",
};

describe("toTaskRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toTaskRow(baseTask, new Map([["proj-1", "Line 3 Expansion"]]));

    expect(row).toEqual({
      id: "task-1",
      taskNumber: "TSK-000007",
      title: "Commission the new conveyor line",
      assignedTo: null,
      projectLabel: "Line 3 Expansion",
      priority: "HIGH",
      status: "IN_PROGRESS",
      estimatedHours: 12,
      actualHours: 4.5,
      createdAt: "2026-10-01T08:00:00.000Z",
    });
  });

  it("surfaces the assignee id and leaves an unknown project null", () => {
    const row = toTaskRow({ ...baseTask, assignedUser: "user-9" });

    expect(row.assignedTo).toBe("user-9");
    expect(row.projectLabel).toBeNull();
  });

  it("never fabricates a value for a blank field", () => {
    const row = toTaskRow({
      ...baseTask,
      taskNumber: " ",
      title: "",
    });

    expect(row.taskNumber).toBe("-");
    expect(row.title).toBe("-");
  });

  it("coerces numeric strings from the API without producing NaN", () => {
    const row = toTaskRow({
      ...baseTask,
      estimatedHours: "8.00" as unknown as number,
      actualHours: undefined as unknown as number,
    });

    expect(row.estimatedHours).toBe(8);
    expect(row.actualHours).toBe(0);
  });
});

describe("buildTaskRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildTaskRows(undefined)).toEqual([]);
    expect(buildTaskRows(null)).toEqual([]);
  });

  it("keeps the API ordering", () => {
    const rows = buildTaskRows([
      baseTask,
      { ...baseTask, id: "task-2", taskNumber: "TSK-000008" },
    ]);

    expect(rows.map((row) => row.taskNumber)).toEqual([
      "TSK-000007",
      "TSK-000008",
    ]);
  });
});

describe("sumActualHours", () => {
  it("adds the real logged hours", () => {
    const rows = buildTaskRows([
      baseTask,
      { ...baseTask, id: "task-2", actualHours: 7.5 },
    ]);

    expect(sumActualHours(rows)).toBe(12);
  });

  it("is zero for an empty list", () => {
    expect(sumActualHours([])).toBe(0);
  });
});

describe("toProjectNameMap", () => {
  it("maps ids to names and skips blanks", () => {
    const map = toProjectNameMap([
      { id: "proj-1", name: "Line 3 Expansion" },
      { id: "proj-2", name: "  " },
      { id: "proj-3" },
    ]);

    expect(map.get("proj-1")).toBe("Line 3 Expansion");
    expect(map.size).toBe(1);
  });
});
