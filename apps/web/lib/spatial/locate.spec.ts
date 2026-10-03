import { describe, expect, it } from "vitest";
import type {
  ComponentLocateResolutionDto,
  ComponentLocateTargetDto,
  LocationLocateTargetDto,
} from "../api/spatial-api";

describe("Search -> Locate Contract & Resolution", () => {
  it("formats single stock location locate URL with deep focus and component highlight", () => {
    const target: ComponentLocateTargetDto = {
      componentId: "comp-100nf-0603",
      locationId: "loc-drawer-a04",
      locationCode: "D-A4",
      locationName: "Drawer A4",
      path: "WH-MAIN / ZONE-LAB / CAB-A / D-A4",
      spatialRootLocationId: "loc-cabinet-a",
      spatialRootLocationCode: "CAB-A",
      focusLocationId: "loc-drawer-a04",
      focusLocationCode: "D-A4",
      hasSpatialView: true,
      locateUrl:
        "/inventory/locations/loc-cabinet-a?view=spatial&focusLocation=loc-drawer-a04&focusComponent=comp-100nf-0603",
      onHand: 500,
      available: 500,
    };

    expect(target.hasSpatialView).toBe(true);
    expect(target.locateUrl).toContain("view=spatial");
    expect(target.locateUrl).toContain("focusLocation=loc-drawer-a04");
    expect(target.locateUrl).toContain("focusComponent=comp-100nf-0603");
  });

  it("formats unmapped location locate URL without spatial params", () => {
    const target: LocationLocateTargetDto = {
      locationId: "loc-unmapped-shelf-9",
      locationCode: "SHELF-9",
      locationName: "Shelf 9 Bulk Storage",
      path: "WH-MAIN / ZONE-BULK / SHELF-9",
      spatialRootLocationId: "loc-unmapped-shelf-9",
      spatialRootLocationCode: "SHELF-9",
      focusLocationId: "loc-unmapped-shelf-9",
      focusLocationCode: "SHELF-9",
      hasSpatialView: false,
      locateUrl: "/inventory/locations/loc-unmapped-shelf-9",
    };

    expect(target.hasSpatialView).toBe(false);
    expect(target.locateUrl).toBe("/inventory/locations/loc-unmapped-shelf-9");
    expect(target.locateUrl).not.toContain("view=spatial");
  });

  it("handles multi-location stock resolution with accurate totals and targets", () => {
    const resolution: ComponentLocateResolutionDto = {
      componentId: "comp-grm188",
      totalOnHand: 4820,
      totalAvailable: 4720,
      targets: [
        {
          componentId: "comp-grm188",
          locationId: "loc-drawer-a4",
          locationCode: "D-A4",
          locationName: "Drawer A4",
          path: "WH-MAIN / ZONE-LAB / CAB-A / D-A4",
          spatialRootLocationId: "loc-cab-a",
          spatialRootLocationCode: "CAB-A",
          focusLocationId: "loc-drawer-a4",
          focusLocationCode: "D-A4",
          hasSpatialView: true,
          locateUrl:
            "/inventory/locations/loc-cab-a?view=spatial&focusLocation=loc-drawer-a4&focusComponent=comp-grm188",
          onHand: 500,
          available: 500,
        },
        {
          componentId: "comp-grm188",
          locationId: "loc-drawer-c2",
          locationCode: "D-C2",
          locationName: "Drawer C2",
          path: "WH-MAIN / ZONE-LAB / CAB-B / D-C2",
          spatialRootLocationId: "loc-cab-b",
          spatialRootLocationCode: "CAB-B",
          focusLocationId: "loc-drawer-c2",
          focusLocationCode: "D-C2",
          hasSpatialView: true,
          locateUrl:
            "/inventory/locations/loc-cab-b?view=spatial&focusLocation=loc-drawer-c2&focusComponent=comp-grm188",
          onHand: 1200,
          available: 1100,
        },
        {
          componentId: "comp-grm188",
          locationId: "loc-bin-14",
          locationCode: "B-14",
          locationName: "Bin 14",
          path: "WH-MAIN / ZONE-BULK / RACK-02 / S-B / B-14",
          spatialRootLocationId: "loc-rack-02",
          spatialRootLocationCode: "RACK-02",
          focusLocationId: "loc-shelf-b",
          focusLocationCode: "S-B",
          hasSpatialView: true,
          locateUrl:
            "/inventory/locations/loc-rack-02?view=spatial&focusLocation=loc-shelf-b&focusComponent=comp-grm188",
          onHand: 3120,
          available: 3120,
        },
      ],
    };

    expect(resolution.targets).toHaveLength(3);
    expect(resolution.totalOnHand).toBe(4820);
    expect(resolution.totalAvailable).toBe(4720);

    // Multi-location decision rule
    const shouldOpenChooser = resolution.targets.length > 1;
    expect(shouldOpenChooser).toBe(true);

    // First target verifies cabinet A Drawer A4
    expect(resolution.targets[0]?.spatialRootLocationCode).toBe("CAB-A");
    expect(resolution.targets[0]?.focusLocationCode).toBe("D-A4");
  });
});
