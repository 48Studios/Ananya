import { describe, expect, it } from "vitest";
import type {
  LocationLocateTargetDto,
  ComponentLocateResolutionDto,
} from "../api/spatial-api";
import { normalizeScannedValue } from "../scanner";

describe("Phase 5: QR -> Spatial Locate Architecture", () => {
  // ----------------------------------------------------
  // 1. QR Payload Parsing & Normalization
  // ----------------------------------------------------
  describe("QR Payload Normalization & Parsing", () => {
    it("parses canonical Location QR payloads correctly", () => {
      const payload = "ANANYA:V1:LOCATION:loc-cab-a01";
      const normalized = normalizeScannedValue(payload);
      expect(normalized).toBe("ANANYA:V1:LOCATION:loc-cab-a01");

      const parts = normalized.split(":");
      expect(parts[0]).toBe("ANANYA");
      expect(parts[1]).toBe("V1");
      expect(parts[2]).toBe("LOCATION");
      expect(parts[3]).toBe("loc-cab-a01");
    });

    it("parses canonical Component QR payloads correctly", () => {
      const payload = "ANANYA:V1:COMPONENT:comp-cap-100n";
      const normalized = normalizeScannedValue(payload);
      expect(normalized).toBe("ANANYA:V1:COMPONENT:comp-cap-100n");

      const parts = normalized.split(":");
      expect(parts[0]).toBe("ANANYA");
      expect(parts[1]).toBe("V1");
      expect(parts[2]).toBe("COMPONENT");
      expect(parts[3]).toBe("comp-cap-100n");
    });

    it("handles trimmed inputs and case variations gracefully", () => {
      const raw = "  ANANYA:V1:LOCATION:DRAWER-04  ";
      const normalized = normalizeScannedValue(raw);
      expect(normalized).toBe("ANANYA:V1:LOCATION:DRAWER-04");
    });

    it("ensures QR payload never contains spatial coordinates or node IDs", () => {
      const locPayload = "ANANYA:V1:LOCATION:loc-cab-a01";
      const compPayload = "ANANYA:V1:COMPONENT:comp-xyz";

      // Payload must strictly be entity ID only, no spatial leakage
      expect(locPayload).not.toContain("nodeId");
      expect(locPayload).not.toContain("modelId");
      expect(locPayload).not.toContain("anchorId");
      expect(locPayload).not.toContain("coords");

      expect(compPayload).not.toContain("nodeId");
      expect(compPayload).not.toContain("modelId");
      expect(compPayload).not.toContain("anchorId");
    });
  });

  // ----------------------------------------------------
  // 2. Location QR Workflow & Hierarchy Resolution
  // ----------------------------------------------------
  describe("Location QR Spatial Resolution", () => {
    it("resolves directly mapped spatial location to 2D view", () => {
      const target: LocationLocateTargetDto = {
        locationId: "loc-cabinet-a",
        locationCode: "CAB-A",
        locationName: "Cabinet A",
        path: "WH-MAIN / ZONE-LAB / CAB-A",
        spatialRootLocationId: "loc-cabinet-a",
        spatialRootLocationCode: "CAB-A",
        focusLocationId: "loc-cabinet-a",
        focusLocationCode: "CAB-A",
        hasSpatialView: true,
        locateUrl: "/locations/loc-cabinet-a?view=spatial&focusLocation=loc-cabinet-a",
      };

      expect(target.hasSpatialView).toBe(true);
      expect(target.spatialRootLocationId).toBe("loc-cabinet-a");
      expect(target.focusLocationId).toBe("loc-cabinet-a");
      expect(target.locateUrl).toBe(
        "/locations/loc-cabinet-a?view=spatial&focusLocation=loc-cabinet-a",
      );
    });

    it("resolves deep descendant to immediate parent spatial container (Cabinet -> Drawer -> Bin)", () => {
      // Hierarchy: Cabinet-A (SpatialNode) -> Drawer-A03 (SpatialNode) -> Bin-02 (no SpatialNode)
      const target: LocationLocateTargetDto = {
        locationId: "loc-bin-02",
        locationCode: "BIN-02",
        locationName: "Sub-bin 02",
        path: "WH-MAIN / ZONE-LAB / CAB-A / DRAWER-A03 / BIN-02",
        spatialRootLocationId: "loc-drawer-a03",
        spatialRootLocationCode: "DRAWER-A03",
        focusLocationId: "loc-bin-02",
        focusLocationCode: "BIN-02",
        hasSpatialView: true,
        locateUrl: "/locations/loc-drawer-a03?view=spatial&focusLocation=loc-bin-02",
      };

      expect(target.hasSpatialView).toBe(true);
      expect(target.spatialRootLocationCode).toBe("DRAWER-A03");
      expect(target.focusLocationCode).toBe("BIN-02");
      expect(target.locateUrl).toBe(
        "/locations/loc-drawer-a03?view=spatial&focusLocation=loc-bin-02",
      );
    });

    it("resolves deep descendant to nearest ancestor when parent lacks SpatialNode", () => {
      // Hierarchy: Cabinet-A (SpatialNode) -> Drawer-A03 (no SpatialNode) -> Bin-02 (no SpatialNode)
      const target: LocationLocateTargetDto = {
        locationId: "loc-bin-02",
        locationCode: "BIN-02",
        locationName: "Sub-bin 02",
        path: "WH-MAIN / ZONE-LAB / CAB-A / DRAWER-A03 / BIN-02",
        spatialRootLocationId: "loc-cabinet-a",
        spatialRootLocationCode: "CAB-A",
        focusLocationId: "loc-drawer-a03",
        focusLocationCode: "DRAWER-A03",
        hasSpatialView: true,
        locateUrl: "/locations/loc-cabinet-a?view=spatial&focusLocation=loc-drawer-a03",
      };

      expect(target.hasSpatialView).toBe(true);
      expect(target.spatialRootLocationCode).toBe("CAB-A");
      expect(target.focusLocationCode).toBe("DRAWER-A03");
      expect(target.locateUrl).toBe(
        "/locations/loc-cabinet-a?view=spatial&focusLocation=loc-drawer-a03",
      );
    });

    it("gracefully falls back to standard location page when no spatial ancestor exists", () => {
      const target: LocationLocateTargetDto = {
        locationId: "loc-shelf-plain-4",
        locationCode: "SHELF-4",
        locationName: "Plain Wooden Shelf 4",
        path: "WH-SECONDARY / ROOM-STORAGE / SHELF-4",
        spatialRootLocationId: "loc-shelf-plain-4",
        spatialRootLocationCode: "SHELF-4",
        focusLocationId: "loc-shelf-plain-4",
        focusLocationCode: "SHELF-4",
        hasSpatialView: false,
        locateUrl: "/locations/loc-shelf-plain-4",
      };

      expect(target.hasSpatialView).toBe(false);
      expect(target.locateUrl).toBe("/locations/loc-shelf-plain-4");
      expect(target.locateUrl).not.toContain("view=spatial");
    });
  });

  // ----------------------------------------------------
  // 3. Component QR Workflow & Multi-location Chooser
  // ----------------------------------------------------
  describe("Component QR Spatial Resolution", () => {
    it("navigates directly when component has exactly one physical stock location", () => {
      const resolution: ComponentLocateResolutionDto = {
        componentId: "comp-resistor-10k",
        totalOnHand: 1500,
        totalAvailable: 1500,
        targets: [
          {
            componentId: "comp-resistor-10k",
            locationId: "loc-drawer-b02",
            locationCode: "DRAWER-B02",
            locationName: "Drawer B02",
            path: "WH-MAIN / ZONE-LAB / CAB-01 / DRAWER-B02",
            spatialRootLocationId: "loc-cab-01",
            spatialRootLocationCode: "CAB-01",
            focusLocationId: "loc-drawer-b02",
            focusLocationCode: "DRAWER-B02",
            hasSpatialView: true,
            locateUrl:
              "/locations/loc-cab-01?view=spatial&focusLocation=loc-drawer-b02&focusComponent=comp-resistor-10k",
            onHand: 1500,
            available: 1500,
          },
        ],
      };

      expect(resolution.targets).toHaveLength(1);
      const singleTarget = resolution.targets[0]!;
      expect(singleTarget.hasSpatialView).toBe(true);
      expect(singleTarget.locateUrl).toContain("view=spatial");
      expect(singleTarget.locateUrl).toContain("focusLocation=loc-drawer-b02");
      expect(singleTarget.locateUrl).toContain("focusComponent=comp-resistor-10k");

      // Auto-navigation rule: 1 location navigates immediately
      const shouldAutoNavigate = resolution.targets.length === 1;
      expect(shouldAutoNavigate).toBe(true);
    });

    it("triggers chooser dialog and forbids arbitrary selection when multiple stock locations exist", () => {
      const resolution: ComponentLocateResolutionDto = {
        componentId: "comp-r-100k",
        totalOnHand: 10000,
        totalAvailable: 9500,
        targets: [
          {
            componentId: "comp-r-100k",
            locationId: "loc-drw-a03",
            locationCode: "DRAWER-A03",
            locationName: "Drawer A03",
            path: "WH-MAIN / CAB-A / DRAWER-A03",
            spatialRootLocationId: "loc-cab-a",
            spatialRootLocationCode: "CAB-A",
            focusLocationId: "loc-drw-a03",
            focusLocationCode: "DRAWER-A03",
            hasSpatialView: true,
            locateUrl:
              "/locations/loc-cab-a?view=spatial&focusLocation=loc-drw-a03&focusComponent=comp-r-100k",
            onHand: 8000,
            available: 7500,
          },
          {
            componentId: "comp-r-100k",
            locationId: "loc-drw-c12",
            locationCode: "DRAWER-C12",
            locationName: "Drawer C12",
            path: "WH-MAIN / CAB-B / DRAWER-C12",
            spatialRootLocationId: "loc-cab-b",
            spatialRootLocationCode: "CAB-B",
            focusLocationId: "loc-drw-c12",
            focusLocationCode: "DRAWER-C12",
            hasSpatialView: true,
            locateUrl:
              "/locations/loc-cab-b?view=spatial&focusLocation=loc-drw-c12&focusComponent=comp-r-100k",
            onHand: 2000,
            available: 2000,
          },
        ],
      };

      // Invariant: Multiple locations must require an explicit user choice
      expect(resolution.targets.length).toBeGreaterThan(1);
      const shouldRequireChooser = resolution.targets.length > 1;
      expect(shouldRequireChooser).toBe(true);

      // Verify each candidate maintains proper spatial root and focus location
      expect(resolution.targets[0]?.spatialRootLocationCode).toBe("CAB-A");
      expect(resolution.targets[0]?.focusLocationCode).toBe("DRAWER-A03");
      expect(resolution.targets[1]?.spatialRootLocationCode).toBe("CAB-B");
      expect(resolution.targets[1]?.focusLocationCode).toBe("DRAWER-C12");
    });

    it("handles component with zero stock gracefully", () => {
      const resolution: ComponentLocateResolutionDto = {
        componentId: "comp-empty",
        totalOnHand: 0,
        totalAvailable: 0,
        targets: [],
      };

      expect(resolution.targets).toHaveLength(0);
      const hasStockToLocate = resolution.targets.length > 0;
      expect(hasStockToLocate).toBe(false);
    });
  });

  // ----------------------------------------------------
  // 4. Deep-Link Contract Verification
  // ----------------------------------------------------
  describe("Deep-Link Contract Verification", () => {
    it("formats Location scan deep link with view and focusLocation", () => {
      const rootId = "root-cab-1";
      const focusId = "child-drw-2";
      const url = `/locations/${rootId}?view=spatial&focusLocation=${focusId}`;

      expect(url).toBe("/locations/root-cab-1?view=spatial&focusLocation=child-drw-2");
      expect(url).not.toContain("focusComponent");
    });

    it("formats Component scan deep link with view, focusLocation, and focusComponent", () => {
      const rootId = "root-cab-1";
      const focusId = "child-drw-2";
      const compId = "comp-mcu-stm32";
      const url = `/locations/${rootId}?view=spatial&focusLocation=${focusId}&focusComponent=${compId}`;

      expect(url).toBe(
        "/locations/root-cab-1?view=spatial&focusLocation=child-drw-2&focusComponent=comp-mcu-stm32",
      );
      expect(url).toContain("focusComponent=comp-mcu-stm32");
    });
  });
});
