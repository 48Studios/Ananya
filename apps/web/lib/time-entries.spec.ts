import { describe, it, expect } from "vitest";
import {
  buildTimeEntryRows,
  sumLoggedHours,
  toTaskTitleMap,
  toTimeEntryRow,
  toUserLabelMap,
} from "./time-entries";
import type { TimeEntryDto } from "./api/time-entries-api";

const baseEntry: TimeEntryDto = {
  id: "te-1",
  userId: "user-1",
  taskId: "task-1",
  date: "2026-10-02T00:00:00.000Z",
  hours: 3.5,
  description: "Line commissioning support",
  status: "SUBMITTED",
  createdAt: "2026-10-02T10:00:00.000Z",
  updatedAt: "2026-10-02T10:00:00.000Z",
};

describe("toTimeEntryRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toTimeEntryRow(baseEntry, {
      userNames: new Map([["user-1", "Alex Morgan"]]),
      taskTitles: new Map([["task-1", "Commission conveyor line"]]),
    });

    expect(row).toEqual({
      id: "te-1",
      employeeLabel: "Alex Morgan",
      taskLabel: "Commission conveyor line",
      description: "Line commissioning support",
      hours: 3.5,
      workDate: "2026-10-02T00:00:00.000Z",
      status: "SUBMITTED",
    });
  });

  it("leaves unknown labels null rather than inventing a name", () => {
    const row = toTimeEntryRow(baseEntry);

    expect(row.employeeLabel).toBeNull();
    expect(row.taskLabel).toBeNull();
  });

  it("treats a missing or non-numeric hour count as zero", () => {
    expect(
      toTimeEntryRow({ ...baseEntry, hours: undefined as unknown as number })
        .hours,
    ).toBe(0);
    expect(
      toTimeEntryRow({ ...baseEntry, hours: "2.25" as unknown as number }).hours,
    ).toBe(2.25);
  });
});

describe("sumLoggedHours", () => {
  it("totals the real logged hours instead of always reporting zero", () => {
    const rows = buildTimeEntryRows([
      baseEntry,
      { ...baseEntry, id: "te-2", hours: 1.25 },
    ]);

    expect(sumLoggedHours(rows)).toBe(4.75);
  });

  it("is zero for an empty timesheet", () => {
    expect(sumLoggedHours([])).toBe(0);
  });
});

describe("label maps", () => {
  it("builds employee labels from name parts, falling back to email", () => {
    const map = toUserLabelMap([
      { id: "user-1", firstName: "Alex", lastName: "Morgan" },
      { id: "user-2", email: "sam@example.test" },
      { id: "user-3", firstName: "   " },
    ]);

    expect(map.get("user-1")).toBe("Alex Morgan");
    expect(map.get("user-2")).toBe("sam@example.test");
    expect(map.has("user-3")).toBe(false);
  });

  it("builds task titles and skips blanks", () => {
    const map = toTaskTitleMap([
      { id: "task-1", title: "Commission conveyor line" },
      { id: "task-2", title: " " },
    ]);

    expect(map.get("task-1")).toBe("Commission conveyor line");
    expect(map.has("task-2")).toBe(false);
  });
});
