import { describe, it, expect } from "vitest";
import {
  formatRunCompletedAt,
  formatRunCreatedAt,
  formatRunHorizon,
  formatRunStatus,
  normalizeCapacityPlans,
  normalizePlanningMessages,
  toWorkCenterCapacityDto,
} from "./mrp-runs";

describe("normalizePlanningMessages", () => {
  it("keeps real planning messages with severity, message and timestamp", () => {
    const rows = normalizePlanningMessages([
      {
        id: "msg-1",
        planningRunId: "run-1",
        severity: "WARNING",
        message: "Capacity plans were not generated.",
        createdAt: "2026-10-03T14:27:36.544Z",
        updatedAt: "2026-10-03T14:27:36.544Z",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "msg-1",
      severity: "WARNING",
      message: "Capacity plans were not generated.",
      createdAt: "2026-10-03T14:27:36.544Z",
    });
  });

  it("drops placeholder rows instead of rendering blank log entries", () => {
    const rows = normalizePlanningMessages([
      {
        id: "msg-blank",
        planningRunId: "run-1",
        severity: undefined as unknown as "INFO",
        message: "",
        createdAt: undefined as unknown as string,
        updatedAt: "",
      },
      {
        id: "msg-missing-severity",
        planningRunId: "run-1",
        severity: undefined as unknown as "INFO",
        message: "Started MRP calculation run",
        createdAt: "2026-10-03T14:27:36.544Z",
        updatedAt: "",
      },
    ]);

    expect(rows).toEqual([]);
  });

  it("returns an empty list for missing payloads", () => {
    expect(normalizePlanningMessages(null)).toEqual([]);
    expect(normalizePlanningMessages(undefined)).toEqual([]);
  });
});

describe("run presentation", () => {
  it("shows the persisted horizon and never invents 0 days", () => {
    expect(formatRunHorizon(30)).toBe("30 days");
    expect(formatRunHorizon(1)).toBe("1 day");
    expect(formatRunHorizon(0)).toBe("—");
    expect(formatRunHorizon(undefined)).toBe("—");
    expect(formatRunHorizon(Number.NaN)).toBe("—");
  });

  it("shows the real status, never defaulting a missing status to COMPLETED", () => {
    expect(formatRunStatus("COMPLETED")).toBe("COMPLETED");
    expect(formatRunStatus(undefined)).toBe("UNKNOWN");
    expect(formatRunStatus("RUNNING")).toBe("RUNNING");
  });

  it("labels completion honestly for each lifecycle state", () => {
    expect(
      formatRunCompletedAt({
        status: "COMPLETED",
        completedAt: "2026-10-03T14:27:36.546Z",
      }),
    ).not.toBe("Pending");

    expect(
      formatRunCompletedAt({ status: "COMPLETED", completedAt: null }),
    ).toBe("—");
    expect(formatRunCompletedAt({ status: "RUNNING" })).toBe("Pending");
    expect(formatRunCompletedAt({ status: "DRAFT" })).toBe("Pending");
    expect(formatRunCompletedAt({ status: "CANCELLED" })).toBe("—");
    expect(formatRunCompletedAt(null)).toBe("—");
  });

  it("shows a fallback when the run date is missing", () => {
    expect(
      formatRunCreatedAt({ createdAt: "2026-10-03T14:27:36.467Z" }),
    ).not.toBe("-");
    expect(
      formatRunCreatedAt({ createdAt: undefined as unknown as string }),
    ).toBe("-");
  });
});

describe("capacity plan mapping", () => {
  it("maps capacity aggregate fields onto the work-center DTO", () => {
    const dto = toWorkCenterCapacityDto({
      id: "cap-1",
      planningRunId: "run-1",
      workCenterId: "wc-cnc",
      workCenterName: "CNC Milling Line 1",
      availableCapacityHours: 160,
      plannedCapacityHours: 200,
      utilizationPercentage: 125,
      isOverloaded: true,
    });

    expect(dto).toEqual({
      id: "cap-1",
      workCenterCode: "wc-cnc",
      name: "CNC Milling Line 1",
      availableHoursWeekly: 160,
      allocatedHoursWeekly: 200,
      utilizationPercentage: 125,
      isOverloaded: true,
    });
  });

  it("flags overload from utilization even when the stored flag is absent", () => {
    const dto = toWorkCenterCapacityDto({
      id: "cap-2",
      planningRunId: "run-1",
      workCenterId: "wc-assembly",
      workCenterName: "Assembly",
      availableCapacityHours: "80",
      plannedCapacityHours: "96",
      utilizationPercentage: "120",
      isOverloaded: false,
    });

    expect(dto.availableHoursWeekly).toBe(80);
    expect(dto.allocatedHoursWeekly).toBe(96);
    expect(dto.isOverloaded).toBe(true);
  });

  it("returns an empty list for missing payloads", () => {
    expect(normalizeCapacityPlans(null)).toEqual([]);
    expect(normalizeCapacityPlans(undefined)).toEqual([]);
  });
});
