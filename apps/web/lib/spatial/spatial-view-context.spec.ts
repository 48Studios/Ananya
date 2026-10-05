import { describe, expect, it } from "vitest";
import {
  hasOwnSpatialFrame,
  resolveSpatialViewContext,
  type SpatialFrameViewInput,
} from "./spatial-view-context";

function frameView({
  childCount = 0,
  hasModel = false,
  containerStatus = "NONE",
}: {
  childCount?: number;
  hasModel?: boolean;
  containerStatus?: SpatialFrameViewInput["parent"]["mapping"]["containerStatus"];
} = {}): SpatialFrameViewInput {
  return {
    children: Array.from({ length: childCount }, (_, index) => ({
      id: `child-${index}`,
    })),
    parent: {
      model: hasModel ? { id: "model-1", code: "MODEL-1" } : null,
      mapping: { containerStatus },
    },
  };
}

const DEMO = {
  warehouse: "loc-warehouse",
  cabinet: "loc-cabinet-a",
  drawer: "loc-drawer-a01",
  bin: "loc-bin-a01-01",
};

describe("hasOwnSpatialFrame", () => {
  it("is true when the location has nested sub-locations", () => {
    expect(hasOwnSpatialFrame(frameView({ childCount: 2 }))).toBe(true);
  });

  it("is true when the location owns a model", () => {
    expect(hasOwnSpatialFrame(frameView({ hasModel: true }))).toBe(true);
  });

  it("is true when the location owns a layout", () => {
    expect(hasOwnSpatialFrame(frameView({ containerStatus: "PUBLISHED" }))).toBe(
      true,
    );
  });

  it("is false for a mapped leaf with no frame of its own", () => {
    expect(hasOwnSpatialFrame(frameView())).toBe(false);
  });
});

describe("resolveSpatialViewContext", () => {
  it("Test 1 — Drawer with its own frame is rendered directly, never substituted by Cabinet", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.drawer,
      requestedHasOwnFrame: true,
      resolvedSpatialRootLocationId: DEMO.cabinet,
      resolvedFocusLocationId: DEMO.drawer,
    });

    expect(resolution.requestedLocationId).toBe(DEMO.drawer);
    expect(resolution.contextLocationId).toBe(DEMO.drawer);
    expect(resolution.isContextView).toBe(false);
  });

  it("Test 1b — Drawer without its own frame is selected inside Cabinet's frame", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.drawer,
      requestedHasOwnFrame: false,
      resolvedSpatialRootLocationId: DEMO.cabinet,
      resolvedFocusLocationId: DEMO.drawer,
    });

    expect(resolution.requestedLocationId).toBe(DEMO.drawer);
    expect(resolution.contextLocationId).toBe(DEMO.cabinet);
    expect(resolution.selectedLocationId).toBe(DEMO.drawer);
    expect(resolution.isContextView).toBe(true);
  });

  it("Test 2 — Bin renders Drawer's frame with Bin selected", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.bin,
      requestedHasOwnFrame: false,
      resolvedSpatialRootLocationId: DEMO.drawer,
      resolvedFocusLocationId: DEMO.bin,
    });

    expect(resolution.requestedLocationId).toBe(DEMO.bin);
    expect(resolution.contextLocationId).toBe(DEMO.drawer);
    expect(resolution.selectedLocationId).toBe(DEMO.bin);
    expect(resolution.isContextView).toBe(true);
  });

  it("Test 3 — Cabinet does not resolve to Warehouse", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.cabinet,
      requestedHasOwnFrame: true,
      resolvedSpatialRootLocationId: DEMO.warehouse,
      resolvedFocusLocationId: DEMO.cabinet,
    });

    expect(resolution.contextLocationId).toBe(DEMO.cabinet);
    expect(resolution.contextLocationId).not.toBe(DEMO.warehouse);
  });

  it("Test 4 — Warehouse remains the requested and rendering context", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.warehouse,
      requestedHasOwnFrame: true,
      resolvedSpatialRootLocationId: DEMO.warehouse,
      resolvedFocusLocationId: DEMO.warehouse,
    });

    expect(resolution.requestedLocationId).toBe(DEMO.warehouse);
    expect(resolution.contextLocationId).toBe(DEMO.warehouse);
    expect(resolution.isContextView).toBe(false);
  });

  it("Test 5/6 — resolution is deterministic, so a refresh or direct URL reproduces it", () => {
    const request = {
      requestedLocationId: DEMO.bin,
      requestedHasOwnFrame: false,
      resolvedSpatialRootLocationId: DEMO.drawer,
      resolvedFocusLocationId: DEMO.bin,
    } as const;

    const fromLocationDetails = resolveSpatialViewContext({ ...request });
    const afterRefresh = resolveSpatialViewContext({ ...request });
    const fromDirectUrl = resolveSpatialViewContext({ ...request });

    expect(afterRefresh).toEqual(fromLocationDetails);
    expect(fromDirectUrl).toEqual(fromLocationDetails);
  });

  it("Test 7 — resolution carries no render mode, so 2D/3D switches keep the selection", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.bin,
      requestedHasOwnFrame: false,
      resolvedSpatialRootLocationId: DEMO.drawer,
      resolvedFocusLocationId: DEMO.bin,
    });

    // The resolved selection is the only input the 2D and 3D renderers share;
    // switching modes cannot change it.
    expect(resolution.isContextView ? resolution.selectedLocationId : null).toBe(
      DEMO.bin,
    );
  });

  it("does not invent an ancestor when no spatial root was resolved", () => {
    const resolution = resolveSpatialViewContext({
      requestedLocationId: DEMO.bin,
      requestedHasOwnFrame: false,
      resolvedSpatialRootLocationId: null,
      resolvedFocusLocationId: null,
    });

    expect(resolution.contextLocationId).toBe(DEMO.bin);
    expect(resolution.isContextView).toBe(false);
  });
});
