import type { Dimensions3D, GeneratedCompartment } from "@ananya/inventory";

/**
 * Pure front-elevation projection for the Inventory Builder.
 *
 * The parametric engine generates compartments in a corner-origin, Y-up frame
 * (`position` is the compartment centre in mm, `dimensions` the outer envelope).
 * `convertGeneratedToSceneLayout` keeps that Y-up frame and the 3D "front"
 * camera preset looks along -Z, so the front elevation is the X (right) x Y (up)
 * plane with screen Y flipped. Depth is intentionally ignored: this is an
 * orthographic projection of the same geometry, not a second layout model.
 */

export interface FrontElevationSlot {
  /** Stable topological identity from the parametric engine (interaction key). */
  slotId: string;
  /** Addressable code, e.g. "A01" (the label shown in 2D and on 3D faceplates). */
  code: string;
  /** Human-readable name, e.g. "Drawer A01". */
  name: string;
  /** Compartment storage kind. */
  kind: string;
  /** Left edge in mm, measured from the container's left wall. */
  xMm: number;
  /** Top edge in mm, measured from the container's top (screen convention). */
  yMm: number;
  /** Outer envelope width in mm. */
  widthMm: number;
  /** Outer envelope height in mm. */
  heightMm: number;
  /** Centre X in the engine's corner-origin frame (mm, positive right). */
  centerXMm: number;
  /** Centre Y in the engine's corner-origin frame (mm, positive up). */
  centerYMm: number;
}

export interface FrontElevationBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FrontElevationProjection {
  container: Dimensions3D;
  /** Slots in visual reading order: top-to-bottom, then left-to-right. */
  slots: FrontElevationSlot[];
  /** Extents of the projected slot geometry in mm (screen space), or null when empty. */
  bounds: FrontElevationBounds | null;
  isEmpty: boolean;
}

export interface FrontElevationViewport {
  widthPx: number;
  heightPx: number;
}

export interface FrontElevationFit {
  /** Pixels per millimetre of the aspect-preserving base fit (zoom excluded). */
  scalePxPerMm: number;
  /** Rendered container width in px at base fit. */
  drawnWidthPx: number;
  /** Rendered container height in px at base fit. */
  drawnHeightPx: number;
  /** Left edge of the drawn container inside the viewport (px). */
  offsetXPx: number;
  /** Top edge of the drawn container inside the viewport (px). */
  offsetYPx: number;
}

export interface FrontElevationViewTransform {
  zoom: number;
  /** Translation in px, applied around the element centre after zoom scaling. */
  offsetXPx: number;
  offsetYPx: number;
}

export interface FrontElevationLabelLayout {
  visible: boolean;
  codeText: string;
  showSecondary: boolean;
  secondaryText: string;
  fontSizePx: number;
  secondaryFontSizePx: number;
}

export const FRONT_ELEVATION_PADDING_PX = 16;
export const FRONT_ELEVATION_MIN_ZOOM = 1;
export const FRONT_ELEVATION_MAX_ZOOM = 12;
export const FRONT_ELEVATION_ZOOM_STEP = 1.4;
export const FRONT_ELEVATION_MIN_LABEL_FONT_PX = 7;
export const FRONT_ELEVATION_MAX_LABEL_FONT_PX = 16;

const LABEL_WIDTH_RATIO = 0.3;
const LABEL_HEIGHT_RATIO = 0.42;
const MONO_CHAR_WIDTH_RATIO = 0.62;
const LABEL_HORIZONTAL_INSET_PX = 4;
const LABEL_SECONDARY_FONT_RATIO = 0.68;

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeMm(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncateToChars(text: string, maxChars: number): string {
  if (maxChars >= text.length) return text;
  // Callers only truncate when at least 3 characters fit ("ab…").
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * Projects generated compartments onto the front (X/Y) elevation plane.
 *
 * The projection derives every rectangle from `position` +/- `dimensions / 2`
 * and the container's physical dimensions. It never regenerates rows, columns,
 * dividers, or slot positions: gaps and dividers remain whatever the parametric
 * engine produced, and slot IDs are carried through unchanged.
 */
export function computeFrontElevation(
  compartments: GeneratedCompartment[],
  container: Dimensions3D,
): FrontElevationProjection {
  const safeContainer: Dimensions3D = {
    widthMm: sanitizeMm(container?.widthMm),
    heightMm: sanitizeMm(container?.heightMm),
    depthMm: sanitizeMm(container?.depthMm),
  };

  const slots = compartments.map((compartment) => {
    const centerXMm = compartment.position.x;
    const centerYMm = compartment.position.y;
    const widthMm = compartment.dimensions.widthMm;
    const heightMm = compartment.dimensions.heightMm;

    return {
      slotId: compartment.slotId,
      code: compartment.code,
      name: compartment.name,
      kind: compartment.kind,
      // Screen Y grows downwards, world Y grows upwards.
      xMm: roundMm(centerXMm - widthMm / 2),
      yMm: roundMm(safeContainer.heightMm - (centerYMm + heightMm / 2)),
      widthMm: roundMm(widthMm),
      heightMm: roundMm(heightMm),
      centerXMm: roundMm(centerXMm),
      centerYMm: roundMm(centerYMm),
    } satisfies FrontElevationSlot;
  });

  slots.sort((a, b) => {
    if (a.yMm !== b.yMm) return a.yMm - b.yMm;
    if (a.xMm !== b.xMm) return a.xMm - b.xMm;
    return a.slotId.localeCompare(b.slotId);
  });

  let bounds: FrontElevationBounds | null = null;
  for (const slot of slots) {
    if (!bounds) {
      bounds = {
        minX: slot.xMm,
        minY: slot.yMm,
        maxX: slot.xMm + slot.widthMm,
        maxY: slot.yMm + slot.heightMm,
      };
      continue;
    }
    bounds.minX = Math.min(bounds.minX, slot.xMm);
    bounds.minY = Math.min(bounds.minY, slot.yMm);
    bounds.maxX = Math.max(bounds.maxX, slot.xMm + slot.widthMm);
    bounds.maxY = Math.max(bounds.maxY, slot.yMm + slot.heightMm);
  }

  return {
    container: safeContainer,
    slots,
    bounds,
    isEmpty: slots.length === 0,
  };
}

/**
 * Computes an aspect-preserving base fit of the container into the viewport.
 * Both axes share one px/mm scale, so the drawing is never stretched.
 */
export function computeFrontElevationFit(
  container: Dimensions3D,
  viewport: FrontElevationViewport,
  paddingPx: number = FRONT_ELEVATION_PADDING_PX,
): FrontElevationFit {
  const widthMm = sanitizeMm(container?.widthMm);
  const heightMm = sanitizeMm(container?.heightMm);
  const availableWidth = Math.max(0, (viewport?.widthPx ?? 0) - paddingPx * 2);
  const availableHeight = Math.max(0, (viewport?.heightPx ?? 0) - paddingPx * 2);
  const scalePxPerMm = Math.min(
    availableWidth / widthMm,
    availableHeight / heightMm,
  );
  const drawnWidthPx = widthMm * scalePxPerMm;
  const drawnHeightPx = heightMm * scalePxPerMm;

  return {
    scalePxPerMm,
    drawnWidthPx,
    drawnHeightPx,
    offsetXPx: ((viewport?.widthPx ?? 0) - drawnWidthPx) / 2,
    offsetYPx: ((viewport?.heightPx ?? 0) - drawnHeightPx) / 2,
  };
}

/** Converts a slot's mm geometry to viewport px at the base fit (zoom = 1). */
export function projectFrontElevationSlotToPixels(
  slot: FrontElevationSlot,
  fit: FrontElevationFit,
): { xPx: number; yPx: number; widthPx: number; heightPx: number } {
  return {
    xPx: fit.offsetXPx + slot.xMm * fit.scalePxPerMm,
    yPx: fit.offsetYPx + slot.yMm * fit.scalePxPerMm,
    widthPx: slot.widthMm * fit.scalePxPerMm,
    heightPx: slot.heightMm * fit.scalePxPerMm,
  };
}

/** Effective px-per-mm at the current zoom, used for label legibility decisions. */
export function computeFrontElevationScale(
  fit: FrontElevationFit,
  zoom: number,
): number {
  return fit.scalePxPerMm * zoom;
}

/**
 * Decides how a compartment label is drawn without altering compartment
 * geometry: labels scale with the compartment, are hidden when they cannot be
 * legible, and are truncated with an ellipsis when the code is too long.
 */
export function computeFrontElevationLabelLayout(input: {
  code: string;
  secondaryLabel?: string | null;
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
}): FrontElevationLabelLayout {
  const widthPx = input.widthMm * input.pxPerMm;
  const heightPx = input.heightMm * input.pxPerMm;
  const fontSizePx = Math.min(
    widthPx * LABEL_WIDTH_RATIO,
    heightPx * LABEL_HEIGHT_RATIO,
    FRONT_ELEVATION_MAX_LABEL_FONT_PX,
  );

  const hidden: FrontElevationLabelLayout = {
    visible: false,
    codeText: "",
    showSecondary: false,
    secondaryText: "",
    fontSizePx: 0,
    secondaryFontSizePx: 0,
  };

  if (
    !Number.isFinite(fontSizePx) ||
    fontSizePx < FRONT_ELEVATION_MIN_LABEL_FONT_PX
  ) {
    return hidden;
  }

  const maxCodeChars = Math.floor(
    (widthPx - LABEL_HORIZONTAL_INSET_PX) / (fontSizePx * MONO_CHAR_WIDTH_RATIO),
  );
  if (maxCodeChars < 3 && maxCodeChars < input.code.length) {
    return hidden;
  }

  const secondaryFontSizePx = Math.max(
    6,
    fontSizePx * LABEL_SECONDARY_FONT_RATIO,
  );
  const secondaryLabel = input.secondaryLabel?.trim() ?? "";
  const secondaryMaxChars = Math.floor(
    (widthPx - LABEL_HORIZONTAL_INSET_PX) /
      (secondaryFontSizePx * MONO_CHAR_WIDTH_RATIO),
  );
  const showSecondary =
    secondaryLabel.length > 0 &&
    heightPx >= fontSizePx * 2.9 + LABEL_HORIZONTAL_INSET_PX &&
    secondaryMaxChars >= 4;

  return {
    visible: true,
    codeText: truncateToChars(input.code, maxCodeChars),
    showSecondary,
    secondaryText: showSecondary
      ? truncateToChars(secondaryLabel, secondaryMaxChars)
      : "",
    fontSizePx,
    secondaryFontSizePx: showSecondary ? secondaryFontSizePx : 0,
  };
}

export function createFrontElevationViewTransform(): FrontElevationViewTransform {
  return { zoom: FRONT_ELEVATION_MIN_ZOOM, offsetXPx: 0, offsetYPx: 0 };
}

/**
 * Clamps zoom and pan. Content larger than the viewport can pan up to its
 * edges; content smaller than the viewport stays centred and fully visible.
 */
export function clampFrontElevationViewTransform(
  view: FrontElevationViewTransform,
  fit: FrontElevationFit,
): FrontElevationViewTransform {
  const zoom = clampValue(
    Number.isFinite(view.zoom) ? view.zoom : FRONT_ELEVATION_MIN_ZOOM,
    FRONT_ELEVATION_MIN_ZOOM,
    FRONT_ELEVATION_MAX_ZOOM,
  );
  const viewportWidthPx = fit.offsetXPx * 2 + fit.drawnWidthPx;
  const viewportHeightPx = fit.offsetYPx * 2 + fit.drawnHeightPx;
  const limitX = Math.max(0, (fit.drawnWidthPx * zoom - viewportWidthPx) / 2);
  const limitY = Math.max(
    0,
    (fit.drawnHeightPx * zoom - viewportHeightPx) / 2,
  );

  return {
    zoom,
    offsetXPx: clampValue(
      Number.isFinite(view.offsetXPx) ? view.offsetXPx : 0,
      -limitX,
      limitX,
    ),
    offsetYPx: clampValue(
      Number.isFinite(view.offsetYPx) ? view.offsetYPx : 0,
      -limitY,
      limitY,
    ),
  };
}

/**
 * Zooms around a viewport anchor (cursor or pinch midpoint) so the physical
 * point under the anchor stays fixed on screen.
 */
export function zoomFrontElevationViewTransform(
  view: FrontElevationViewTransform,
  fit: FrontElevationFit,
  factor: number,
  anchorXPx: number,
  anchorYPx: number,
): FrontElevationViewTransform {
  const nextZoom = clampValue(
    view.zoom * factor,
    FRONT_ELEVATION_MIN_ZOOM,
    FRONT_ELEVATION_MAX_ZOOM,
  );
  const centerXPx = fit.offsetXPx + fit.drawnWidthPx / 2;
  const centerYPx = fit.offsetYPx + fit.drawnHeightPx / 2;
  const ratio = nextZoom / view.zoom;

  return clampFrontElevationViewTransform(
    {
      zoom: nextZoom,
      offsetXPx:
        anchorXPx - centerXPx - ratio * (anchorXPx - centerXPx - view.offsetXPx),
      offsetYPx:
        anchorYPx - centerYPx - ratio * (anchorYPx - centerYPx - view.offsetYPx),
    },
    fit,
  );
}

export function panFrontElevationViewTransform(
  view: FrontElevationViewTransform,
  fit: FrontElevationFit,
  deltaXPx: number,
  deltaYPx: number,
): FrontElevationViewTransform {
  return clampFrontElevationViewTransform(
    {
      zoom: view.zoom,
      offsetXPx: view.offsetXPx + deltaXPx,
      offsetYPx: view.offsetYPx + deltaYPx,
    },
    fit,
  );
}
