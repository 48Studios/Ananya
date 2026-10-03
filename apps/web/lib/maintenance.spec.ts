import { describe, it, expect } from "vitest";
import {
  buildMaintenanceRows,
  FREQUENCY_LABELS,
  toMaintenanceRow,
} from "./maintenance";
import type { MaintenanceScheduleDto } from "./api/maintenance-api";

const baseSchedule: MaintenanceScheduleDto = {
  id: "ms-1",
  scheduleNumber: "MS-000012",
  customerId: "cust-1",
  assetName: "CNC spindle",
  serialNumber: "SN-4471",
  frequency: "QUARTERLY",
  nextVisitDate: "2026-12-01T00:00:00.000Z",
  assignedTechnician: "Alex Morgan",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("toMaintenanceRow", () => {
  it("reads the fields the API actually returns", () => {
    const row = toMaintenanceRow(
      baseSchedule,
      new Map([["cust-1", "Acme Industrial"]]),
    );

    expect(row).toEqual({
      id: "ms-1",
      scheduleNumber: "MS-000012",
      assetLabel: "CNC spindle",
      assetSubLabel: "SN-4471",
      frequency: "QUARTERLY",
      nextVisitDate: "2026-12-01T00:00:00.000Z",
      assignedTechnician: "Alex Morgan",
      customerName: "Acme Industrial",
      status: "ACTIVE",
    });
  });

  it("leaves an unresolved customer and a missing serial null", () => {
    const row = toMaintenanceRow({ ...baseSchedule, serialNumber: undefined });

    expect(row.customerName).toBeNull();
    expect(row.assetSubLabel).toBeNull();
  });

  it("never invents an asset name", () => {
    const row = toMaintenanceRow({ ...baseSchedule, assetName: "  " });

    expect(row.assetLabel).toBe("-");
  });

  it("keeps the status vocabulary the domain uses", () => {
    expect(toMaintenanceRow({ ...baseSchedule, status: "PAUSED" }).status).toBe(
      "PAUSED",
    );
  });
});

describe("buildMaintenanceRows", () => {
  it("returns an empty list for a missing response", () => {
    expect(buildMaintenanceRows(undefined)).toEqual([]);
    expect(buildMaintenanceRows(null)).toEqual([]);
  });

  it("labels every supported frequency", () => {
    expect(Object.keys(FREQUENCY_LABELS).sort()).toEqual([
      "ANNUAL",
      "BIANNUAL",
      "MONTHLY",
      "QUARTERLY",
    ]);
  });
});
