/**
 * Placement geometry for the anchored spatial inspector.
 *
 * This module is intentionally free of DOM access so the collision rules can be
 * unit tested directly. The hook that feeds it real measurements lives in
 * `use-anchored-inspector.ts`.
 *
 * Preferred placement order for a selected spatial object:
 *   right → left → below → above → constrained fallback inside the spatial viewport.
 */

export interface ScreenRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type InspectorPlacement =
  | "right"
  | "left"
  | "below"
  | "above"
  | "fallback"
  | "sheet";

export interface InspectorPlacementInput {
  /**
   * Screen rectangle of the selected spatial object. `null` when the object
   * could not be measured (for example a 3D object that is not in the scene),
   * which yields the constrained fallback placement.
   */
  anchor: ScreenRect | null;
  /** Usable spatial viewport (the 2D canvas region / 3D host), in client coordinates. */
  bounds: ScreenRect;
  /** Browser viewport size. */
  viewport: { width: number; height: number };
  preferredWidth?: number;
  maxWidth?: number;
  spacing?: number;
}

export interface InspectorPlacementResult {
  placement: InspectorPlacement;
  /** Client coordinates for a `position: fixed` element. */
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Imperative bridge exposed by the 3D viewport so anchored overlays can follow
 * a selected scene object without duplicating camera or raycast logic.
 */
export interface Spatial3DAnchorApi {
  /** Projects a scene object's bounding box into client coordinates. */
  projectLocationBounds(locationId: string): ScreenRect | null;
  /** True when the client coordinates hit a selectable spatial object. */
  hitTestSpatialObject(clientX: number, clientY: number): boolean;
  /**
   * Notifies when projected scene geometry moved: camera orbit/zoom/pan, preset
   * transitions, or a drawer open/close animation.
   */
  subscribeSceneMovement(listener: () => void): () => void;
}

export const INSPECTOR_ANCHOR_SPACING_PX = 14;
export const INSPECTOR_MIN_WIDTH_PX = 280;
export const INSPECTOR_PREFERRED_WIDTH_PX = 400;
export const INSPECTOR_MAX_WIDTH_PX = 440;
/** Minimum height for a side placement to be worth choosing. */
export const INSPECTOR_MIN_HEIGHT_PX = 220;
/** Minimum height for a below/above placement to be usable at all. */
export const INSPECTOR_MIN_VISIBLE_HEIGHT_PX = 160;
/** Below this browser width the inspector becomes a non-modal bottom sheet. */
export const INSPECTOR_SHEET_BREAKPOINT_PX = 640;
/** Share of the spatial viewport an inspector may occupy vertically. */
export const INSPECTOR_HEIGHT_BUDGET_RATIO = 0.78;
/** Height a side placement should aim for, so low objects are not squeezed. */
export const INSPECTOR_COMFORTABLE_HEIGHT_RATIO = 0.5;
export const INSPECTOR_COMFORTABLE_HEIGHT_MAX_PX = 360;
/** Share of the spatial viewport a bottom sheet may occupy vertically. */
export const INSPECTOR_SHEET_HEIGHT_RATIO = 0.62;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createScreenRect(
  top: number,
  left: number,
  right: number,
  bottom: number,
): ScreenRect {
  return {
    top,
    left,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Clamps the spatial viewport into the browser viewport, so
 * `position: fixed` geometry is always derived from visible pixels.
 */
export function clampScreenRectToViewport(
  rect: ScreenRect,
  viewport: { width: number; height: number },
): ScreenRect {
  const left = clamp(rect.left, 0, viewport.width);
  const right = clamp(rect.right, left, viewport.width);
  const top = clamp(rect.top, 0, viewport.height);
  const bottom = clamp(rect.bottom, top, viewport.height);
  return createScreenRect(top, left, right, bottom);
}

export function isSpatialSheetViewport(viewportWidth: number): boolean {
  return viewportWidth < INSPECTOR_SHEET_BREAKPOINT_PX;
}

function buildSheet(
  bounds: ScreenRect,
  spacing: number,
): InspectorPlacementResult {
  const availableHeight = Math.max(120, bounds.height - spacing * 2);
  const preferredHeight = Math.round(bounds.height * INSPECTOR_SHEET_HEIGHT_RATIO);
  const maxHeight = Math.min(
    Math.max(INSPECTOR_MIN_VISIBLE_HEIGHT_PX, preferredHeight),
    availableHeight,
  );
  const width = Math.max(0, bounds.width - spacing * 2);
  return {
    placement: "sheet",
    left: bounds.left + spacing,
    top: Math.max(bounds.top + spacing, bounds.bottom - spacing - maxHeight),
    width,
    maxHeight,
  };
}

/**
 * Final containment guard: whatever branch produced the candidate, the panel is
 * clamped so it can never leave the spatial viewport (and therefore can never
 * cover the page footer or create page-level overflow).
 */
function containWithinBounds(
  candidate: InspectorPlacementResult,
  bounds: ScreenRect,
  spacing: number,
  minVisibleHeight: number,
): InspectorPlacementResult {
  const width = clamp(
    candidate.width,
    0,
    Math.max(0, bounds.width - spacing * 2),
  );
  const left = clamp(
    candidate.left,
    bounds.left + spacing,
    Math.max(bounds.left + spacing, bounds.right - spacing - width),
  );
  const minTop = bounds.top + spacing;
  const maxTop = Math.max(minTop, bounds.bottom - spacing - minVisibleHeight);
  const top = clamp(candidate.top, minTop, maxTop);
  const maxHeight = clamp(
    candidate.maxHeight,
    0,
    Math.max(0, bounds.bottom - spacing - top),
  );
  return {
    placement: candidate.placement,
    left,
    top,
    width,
    maxHeight,
  };
}

export function computeInspectorPlacement(
  input: InspectorPlacementInput,
): InspectorPlacementResult {
  const spacing = input.spacing ?? INSPECTOR_ANCHOR_SPACING_PX;
  const preferredWidth = input.preferredWidth ?? INSPECTOR_PREFERRED_WIDTH_PX;
  const maxWidth = input.maxWidth ?? INSPECTOR_MAX_WIDTH_PX;

  const bounds = clampScreenRectToViewport(input.bounds, input.viewport);
  const contain = (candidate: InspectorPlacementResult) =>
    containWithinBounds(
      candidate,
      bounds,
      spacing,
      INSPECTOR_MIN_VISIBLE_HEIGHT_PX,
    );
  const horizontalRoom = Math.max(0, bounds.width - spacing * 2);

  if (
    isSpatialSheetViewport(input.viewport.width) ||
    horizontalRoom < INSPECTOR_MIN_WIDTH_PX ||
    bounds.height < INSPECTOR_MIN_VISIBLE_HEIGHT_PX
  ) {
    return contain(buildSheet(bounds, spacing));
  }

  const available = Math.min(preferredWidth, maxWidth, horizontalRoom);
  const heightCap = Math.max(
    INSPECTOR_MIN_VISIBLE_HEIGHT_PX,
    Math.round(bounds.height * INSPECTOR_HEIGHT_BUDGET_RATIO),
  );
  const heightLimit = (availableHeight: number) =>
    Math.min(availableHeight, heightCap);

  const anchor = input.anchor;
  if (anchor) {
    // Side placements align the inspector's top with the selected object's top.
    // A low object would leave only a sliver of height below it, so the top is
    // raised just enough to keep a comfortable panel while still overlapping the
    // selected object vertically — and never past the bottom of the viewport.
    const comfortableHeight = clamp(
      Math.round(bounds.height * INSPECTOR_COMFORTABLE_HEIGHT_RATIO),
      INSPECTOR_MIN_HEIGHT_PX,
      INSPECTOR_COMFORTABLE_HEIGHT_MAX_PX,
    );
    const maxTop = Math.max(
      bounds.top + spacing,
      bounds.bottom - spacing - Math.min(comfortableHeight, heightCap),
    );
    const sideTop = clamp(anchor.top, bounds.top + spacing, maxTop);
    const sideHeight = bounds.bottom - spacing - sideTop;

    const rightRoom = bounds.right - spacing - anchor.right;
    if (
      rightRoom >= INSPECTOR_MIN_WIDTH_PX &&
      sideHeight >= INSPECTOR_MIN_HEIGHT_PX
    ) {
      return contain({
        placement: "right",
        left: anchor.right + spacing,
        top: sideTop,
        width: Math.min(available, rightRoom),
        maxHeight: heightLimit(sideHeight),
      });
    }

    const leftRoom = anchor.left - spacing - bounds.left;
    if (
      leftRoom >= INSPECTOR_MIN_WIDTH_PX &&
      sideHeight >= INSPECTOR_MIN_HEIGHT_PX
    ) {
      return contain({
        placement: "left",
        left: anchor.left - spacing - Math.min(available, leftRoom),
        top: sideTop,
        width: Math.min(available, leftRoom),
        maxHeight: heightLimit(sideHeight),
      });
    }

    const width = available;
    const belowTop = anchor.bottom + spacing;
    const belowHeight = bounds.bottom - spacing - belowTop;
    if (belowHeight >= INSPECTOR_MIN_VISIBLE_HEIGHT_PX) {
      const maxLeft = Math.max(
        bounds.left + spacing,
        bounds.right - spacing - width,
      );
      return contain({
        placement: "below",
        left: clamp(anchor.left, bounds.left + spacing, maxLeft),
        top: belowTop,
        width,
        maxHeight: heightLimit(belowHeight),
      });
    }

    const aboveHeight = anchor.top - spacing - bounds.top;
    if (aboveHeight >= INSPECTOR_MIN_VISIBLE_HEIGHT_PX) {
      const maxHeight = heightLimit(aboveHeight);
      const maxLeft = Math.max(
        bounds.left + spacing,
        bounds.right - spacing - width,
      );
      return contain({
        placement: "above",
        left: clamp(anchor.left, bounds.left + spacing, maxLeft),
        top: Math.max(bounds.top + spacing, anchor.top - spacing - maxHeight),
        width,
        maxHeight,
      });
    }
  }

  // Constrained fallback: dock on the side of the anchor with the most room,
  // otherwise dock to the trailing edge of the spatial viewport.
  const anchorCenterX = anchor ? (anchor.left + anchor.right) / 2 : null;
  const boundsCenterX = (bounds.left + bounds.right) / 2;
  const dockRight = anchorCenterX === null || anchorCenterX < boundsCenterX;
  const maxHeight = heightLimit(bounds.height - spacing * 2);
  const fallbackTop = anchor
    ? clamp(
        anchor.top,
        bounds.top + spacing,
        Math.max(bounds.top + spacing, bounds.bottom - spacing - maxHeight),
      )
    : bounds.top + spacing;

  return contain({
    placement: "fallback",
    left: dockRight
      ? Math.max(bounds.left + spacing, bounds.right - spacing - available)
      : bounds.left + spacing,
    top: fallbackTop,
    width: available,
    maxHeight,
  });
}
