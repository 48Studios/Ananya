import { describe, expect, it } from "vitest";
import {
  INSPECTOR_COMFORTABLE_HEIGHT_MAX_PX,
  INSPECTOR_MAX_WIDTH_PX,
  INSPECTOR_MIN_HEIGHT_PX,
  INSPECTOR_MIN_WIDTH_PX,
  INSPECTOR_PREFERRED_WIDTH_PX,
  INSPECTOR_SHEET_BREAKPOINT_PX,
  computeInspectorPlacement,
  createScreenRect,
  isSpatialSheetViewport,
  type InspectorPlacementResult,
  type ScreenRect,
} from "./inspector-placement";

/** Spatial viewport: 1000×600 starting at (300, 100). */
const BOUNDS: ScreenRect = createScreenRect(100, 300, 1300, 700);
const VIEWPORT = { width: 1440, height: 810 };

function rect(left: number, top: number, width: number, height: number): ScreenRect {
  return createScreenRect(top, left, left + width, top + height);
}

function place(
  anchor: ScreenRect | null,
  overrides: Partial<Parameters<typeof computeInspectorPlacement>[0]> = {},
): InspectorPlacementResult {
  return computeInspectorPlacement({
    anchor,
    bounds: BOUNDS,
    viewport: VIEWPORT,
    ...overrides,
  });
}

function expectInsideBounds(result: InspectorPlacementResult): void {
  expect(result.left).toBeGreaterThanOrEqual(BOUNDS.left);
  expect(result.left + result.width).toBeLessThanOrEqual(BOUNDS.right);
  expect(result.top).toBeGreaterThanOrEqual(BOUNDS.top);
  expect(result.top + result.maxHeight).toBeLessThanOrEqual(BOUNDS.bottom);
}

describe("computeInspectorPlacement", () => {
  it("places the inspector to the right of a selected object with room around it", () => {
    const anchor = rect(400, 200, 100, 80);
    const result = place(anchor);

    expect(result.placement).toBe("right");
    expect(result.left).toBe(anchor.right + 14);
    expect(result.top).toBe(anchor.top);
    expect(result.width).toBe(INSPECTOR_PREFERRED_WIDTH_PX);
    expectInsideBounds(result);
  });

  it("flips to the left of an object near the right edge of the spatial viewport", () => {
    const anchor = rect(1000, 250, 100, 80);
    const result = place(anchor);

    expect(result.placement).toBe("left");
    expect(result.left + result.width).toBe(anchor.left - 14);
    expectInsideBounds(result);
  });

  it("narrows the inspector instead of overflowing when the side room is tight", () => {
    const anchor = rect(886, 250, 100, 80); // 300px of room to the right
    const result = place(anchor);

    expect(result.placement).toBe("right");
    expect(result.width).toBe(300);
    expect(result.width).toBeLessThan(INSPECTOR_PREFERRED_WIDTH_PX);
    expect(result.width).toBeGreaterThanOrEqual(INSPECTOR_MIN_WIDTH_PX);
    expectInsideBounds(result);
  });

  it("places the inspector below a wide object that has no usable side room", () => {
    const anchor = rect(320, 120, 970, 80);
    const result = place(anchor);

    expect(result.placement).toBe("below");
    expect(result.top).toBe(anchor.bottom + 14);
    expect(result.left).toBeGreaterThanOrEqual(BOUNDS.left);
    expect(result.left + result.width).toBeLessThanOrEqual(BOUNDS.right);
    expectInsideBounds(result);
  });

  it("places the inspector above an object near the bottom of the spatial viewport", () => {
    const anchor = rect(320, 640, 970, 80);
    const result = place(anchor);

    expect(result.placement).toBe("above");
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(anchor.top - 14);
    expect(result.top).toBeGreaterThanOrEqual(BOUNDS.top);
    expectInsideBounds(result);
  });

  it("falls back to a constrained dock when no side of the object has room", () => {
    const anchor = rect(320, 130, 970, 470);
    const result = place(anchor);

    expect(result.placement).toBe("fallback");
    expect(result.top).toBe(anchor.top);
    expect(result.width).toBe(INSPECTOR_PREFERRED_WIDTH_PX);
    expectInsideBounds(result);
  });

  it("docks to the trailing edge with a bounded height when the anchor is unknown", () => {
    const result = place(null);

    expect(result.placement).toBe("fallback");
    expect(result.left + result.width).toBe(BOUNDS.right - 14);
    expect(result.top).toBe(BOUNDS.top + 14);
    expectInsideBounds(result);
  });

  it("never lets the inspector cross the bottom of the spatial viewport", () => {
    const result = place(rect(400, 690, 100, 40));

    expect(result.top + result.maxHeight).toBeLessThanOrEqual(BOUNDS.bottom);
    expectInsideBounds(result);
  });

  it("clamps the anchor when the selected object is scrolled out of the viewport", () => {
    const scrolledOut = rect(400, -600, 100, 80);
    const result = place(scrolledOut);

    expect(result.top).toBeGreaterThanOrEqual(BOUNDS.top);
    expectInsideBounds(result);
  });

  it("clamps the spatial bounds to the browser viewport so the footer stays clear", () => {
    const overflowing = createScreenRect(100, 300, 1300, 900);
    const result = computeInspectorPlacement({
      anchor: rect(400, 700, 100, 80),
      bounds: overflowing,
      viewport: { width: 1440, height: 800 },
    });

    expect(result.top + result.maxHeight).toBeLessThanOrEqual(800);
  });

  it("caps the inspector height to a share of the spatial viewport", () => {
    const result = place(rect(400, 120, 100, 80));

    expect(result.maxHeight).toBeLessThanOrEqual(Math.round(BOUNDS.height * 0.78));
    expect(result.maxHeight).toBeGreaterThan(0);
  });

  it("uses a non-modal bottom sheet on narrow viewports", () => {
    const bounds = createScreenRect(60, 8, 380, 700);
    const result = computeInspectorPlacement({
      anchor: rect(20, 200, 120, 80),
      bounds,
      viewport: { width: 390, height: 780 },
    });

    expect(isSpatialSheetViewport(390)).toBe(true);
    expect(result.placement).toBe("sheet");
    expect(result.left).toBe(bounds.left + 14);
    expect(result.width).toBe(bounds.width - 28);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(bounds.bottom);
    expect(result.top).toBeGreaterThan(bounds.top);
    expect(INSPECTOR_SHEET_BREAKPOINT_PX).toBe(640);
  });

  it("falls back to a sheet when the spatial viewport is too small to anchor at all", () => {
    const bounds = createScreenRect(200, 300, 460, 700); // 160px wide
    const result = computeInspectorPlacement({
      anchor: rect(320, 300, 120, 80),
      bounds,
      viewport: VIEWPORT,
    });

    expect(result.placement).toBe("sheet");
    expect(result.width).toBe(bounds.width - 28);
  });

  it("honours a custom preferred and maximum width", () => {
    const result = place(rect(400, 200, 100, 80), {
      preferredWidth: 360,
      maxWidth: INSPECTOR_MAX_WIDTH_PX,
    });

    expect(result.width).toBe(360);
  });

  it("never returns a width larger than the available horizontal room", () => {
    const results = [place(rect(400, 200, 100, 80)), place(rect(1000, 200, 100, 80))];
    for (const result of results) {
      expect(result.width).toBeLessThanOrEqual(BOUNDS.width - 28);
    }
  });

  it("raises the panel just enough to stay comfortable for a low selected object", () => {
    const anchor = rect(400, 660, 120, 80); // near the bottom of the viewport
    const result = place(anchor);

    expect(result.placement).toBe("right");
    // Comfortable height (half the viewport, capped) rather than the 80px sliver
    // that would remain under the anchor's own top edge.
    expect(result.maxHeight).toBeGreaterThanOrEqual(INSPECTOR_MIN_HEIGHT_PX);
    expect(result.maxHeight).toBeLessThanOrEqual(
      INSPECTOR_COMFORTABLE_HEIGHT_MAX_PX,
    );
    expect(result.top).toBeLessThan(anchor.top);
    expect(result.top + result.maxHeight).toBeGreaterThan(anchor.top);
    expectInsideBounds(result);
  });

  it("stays contained when the selected object is scrolled below the visible area", () => {
    const result = place(rect(400, 900, 100, 80));

    expect(result.top).toBeGreaterThanOrEqual(BOUNDS.top);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(BOUNDS.bottom);
    expectInsideBounds(result);
  });

  it("stays contained inside a barely visible spatial viewport", () => {
    const sliver = createScreenRect(600, 300, 1300, 700);
    const result = computeInspectorPlacement({
      anchor: rect(400, 200, 100, 80),
      bounds: sliver,
      viewport: VIEWPORT,
    });

    expect(result.top).toBeGreaterThanOrEqual(sliver.top);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(sliver.bottom);
    expect(result.left).toBeGreaterThanOrEqual(sliver.left);
    expect(result.left + result.width).toBeLessThanOrEqual(sliver.right);
  });

  it("keeps the inspector inside the spatial viewport for every anchor position", () => {
    const anchors: ScreenRect[] = [];
    for (let left = -200; left <= 1400; left += 120) {
      for (let top = -300; top <= 900; top += 150) {
        anchors.push(rect(left, top, 120, 90));
      }
    }

    for (const anchor of anchors) {
      const result = place(anchor);
      const label = `anchor(${anchor.left},${anchor.top}) → ${result.placement}`;
      expect(result.width, label).toBeGreaterThan(0);
      expect(result.left, label).toBeGreaterThanOrEqual(BOUNDS.left);
      expect(result.left + result.width, label).toBeLessThanOrEqual(BOUNDS.right);
      expect(result.top, label).toBeGreaterThanOrEqual(BOUNDS.top);
      expect(result.top + result.maxHeight, label).toBeLessThanOrEqual(BOUNDS.bottom);
    }
  });
});
