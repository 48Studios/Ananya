"use client";

import * as React from "react";
import {
  type GeneratedCompartment,
  type ParametricCompartmentDiff,
  type ParametricStorageConfig,
  type ParametricTemplateType,
} from "@ananya/inventory";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SlotMappingRecord } from "@/lib/spatial/inventory-builder-state";
import {
  computeFrontElevation,
  computeFrontElevationFit,
  computeFrontElevationLabelLayout,
  createFrontElevationViewTransform,
  panFrontElevationViewTransform,
  zoomFrontElevationViewTransform,
  FRONT_ELEVATION_PADDING_PX,
  FRONT_ELEVATION_ZOOM_STEP,
  type FrontElevationViewTransform,
} from "@/lib/spatial/spatial-front-elevation";
import { cn } from "@/lib/utils";

export interface ParametricPreview2DProps {
  config: ParametricStorageConfig;
  compartments: GeneratedCompartment[];
  diff: ParametricCompartmentDiff | null;
  mappings: Map<string, SlotMappingRecord>;
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  className?: string;
}

const TEMPLATE_LABELS: Record<ParametricTemplateType, string> = {
  SMD_DRAWER_CABINET: "SMD Cabinet",
  OPEN_BIN_MATRIX: "Open Bins",
  PALLET_RACK: "Pallet Rack",
  GRID_PARTS_TRAY: "Parts Tray",
};

const CLICK_SUPPRESSION_PX = 4;

interface PointerPosition {
  x: number;
  y: number;
}

interface PinchAnchor {
  distance: number;
  midX: number;
  midY: number;
}

/**
 * Dimensionally faithful front elevation of the parametric layout.
 *
 * Every rectangle is projected from the same `GeneratedCompartment` geometry
 * that feeds the 3D renderer (see `spatial-front-elevation.ts`); this component
 * owns no layout model of its own. Selection is keyed by the engine's stable
 * `slotId`, so 2D and 3D stay synchronized through the shared workspace state.
 */
export function ParametricPreview2D({
  config,
  compartments,
  diff,
  mappings,
  selectedSlotId,
  onSelectSlot,
  className,
}: ParametricPreview2DProps) {
  const [viewportElement, setViewportElement] =
    React.useState<HTMLDivElement | null>(null);
  const pointersRef = React.useRef(new Map<number, PointerPosition>());
  const pinchRef = React.useRef<PinchAnchor | null>(null);
  const suppressClickRef = React.useRef(false);
  const pointerStartRef = React.useRef<PointerPosition | null>(null);

  const [viewportSize, setViewportSize] = React.useState({
    widthPx: 0,
    heightPx: 0,
  });
  const [view, setView] = React.useState<FrontElevationViewTransform>(
    createFrontElevationViewTransform,
  );
  const [focusedSlotId, setFocusedSlotId] = React.useState<string | null>(null);

  const containerDimensions = config.dimensions;

  const projection = React.useMemo(
    () => computeFrontElevation(compartments, containerDimensions),
    [compartments, containerDimensions],
  );

  const fit = React.useMemo(
    () => computeFrontElevationFit(containerDimensions, viewportSize),
    [containerDimensions, viewportSize],
  );

  // Latest fit for the native wheel listener and pointer gestures.
  const fitRef = React.useRef(fit);
  fitRef.current = fit;

  // Geometry changes must not leave a stale zoom/pan transform behind.
  const { widthMm, heightMm, depthMm } = containerDimensions;
  React.useEffect(() => {
    setView(createFrontElevationViewTransform());
  }, [widthMm, heightMm, depthMm]);

  React.useEffect(() => {
    if (!viewportElement || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const rect = viewportElement.getBoundingClientRect();
      setViewportSize((prev) =>
        prev.widthPx === rect.width && prev.heightPx === rect.height
          ? prev
          : { widthPx: rect.width, heightPx: rect.height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [viewportElement]);

  const zoomBy = React.useCallback((factor: number) => {
    const currentFit = fitRef.current;
    const anchorX = currentFit.offsetXPx + currentFit.drawnWidthPx / 2;
    const anchorY = currentFit.offsetYPx + currentFit.drawnHeightPx / 2;
    setView((prev) =>
      zoomFrontElevationViewTransform(
        prev,
        currentFit,
        factor,
        anchorX,
        anchorY,
      ),
    );
  }, []);

  const resetView = React.useCallback(() => {
    setView(createFrontElevationViewTransform());
  }, []);

  // Wheel zoom is registered natively so the listener can be non-passive.
  React.useEffect(() => {
    if (!viewportElement) return;
    const element = viewportElement;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.min(
        2,
        Math.max(0.5, Math.exp(-event.deltaY * 0.0015)),
      );
      const anchorX = event.clientX - rect.left;
      const anchorY = event.clientY - rect.top;
      setView((prev) =>
        zoomFrontElevationViewTransform(
          prev,
          fitRef.current,
          factor,
          anchorX,
          anchorY,
        ),
      );
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [viewportElement]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const element = viewportElement;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size === 1) {
      pointerStartRef.current = point;
      suppressClickRef.current = false;
    }
    if (pointersRef.current.size === 2) {
      pinchRef.current = measurePinch(pointersRef.current);
    }
    // Capture is deferred until an actual drag starts so that plain clicks
    // still reach the compartment being selected.
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = viewportElement;
    const previous = pointersRef.current.get(event.pointerId);
    if (!element || !previous) return;
    const rect = element.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointersRef.current.set(event.pointerId, point);

    if (pointersRef.current.size === 1) {
      const start = pointerStartRef.current;
      const travelled = start
        ? Math.hypot(point.x - start.x, point.y - start.y)
        : 0;
      if (travelled > CLICK_SUPPRESSION_PX) {
        suppressClickRef.current = true;
        capturePointer(element, event.pointerId);
      }
      setView((prev) =>
        panFrontElevationViewTransform(
          prev,
          fitRef.current,
          point.x - previous.x,
          point.y - previous.y,
        ),
      );
      return;
    }

    if (pointersRef.current.size === 2) {
      suppressClickRef.current = true;
      capturePointer(element, event.pointerId);
      const pinch = measurePinch(pointersRef.current);
      const anchor = pinchRef.current;
      if (pinch && anchor && anchor.distance > 0) {
        setView((prev) =>
          zoomFrontElevationViewTransform(
            prev,
            fitRef.current,
            pinch.distance / anchor.distance,
            pinch.midX,
            pinch.midY,
          ),
        );
        const deltaX = pinch.midX - anchor.midX;
        const deltaY = pinch.midY - anchor.midY;
        if (deltaX !== 0 || deltaY !== 0) {
          setView((prev) =>
            panFrontElevationViewTransform(
              prev,
              fitRef.current,
              deltaX,
              deltaY,
            ),
          );
        }
      }
      pinchRef.current = pinch;
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      pointerStartRef.current = null;
    }
    const element = viewportElement;
    if (element?.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    if (suppressClickRef.current) {
      // Reset after the click event that follows this pointer sequence.
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const handleSlotClick = (slotId: string) => {
    if (suppressClickRef.current) return;
    onSelectSlot(slotId);
  };

  const modifiedSlotIds = React.useMemo(() => {
    if (!diff) return new Set<string>();
    return new Set(diff.modified.map((entry) => entry.current.slotId));
  }, [diff]);

  if (compartments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-dashed rounded-lg text-xs text-muted-foreground">
        No compartments generated. Verify configuration parameters.
      </div>
    );
  }

  const pxPerMm = fit.scalePxPerMm * view.zoom;
  const baseStrokeMm = pxPerMm > 0 ? 1 / pxPerMm : 0;
  const selectedStrokeMm = pxPerMm > 0 ? 2 / pxPerMm : 0;
  const paddingMm =
    fit.scalePxPerMm > 0 ? FRONT_ELEVATION_PADDING_PX / fit.scalePxPerMm : 0;

  const outerWidthMm = projection.container.widthMm;
  const outerHeightMm = projection.container.heightMm;
  const viewBox = `${-paddingMm} ${-paddingMm} ${outerWidthMm + paddingMm * 2} ${
    outerHeightMm + paddingMm * 2
  }`;

  return (
    <div
      className={cn(
        "flex flex-col w-full h-full min-h-[420px] border border-border rounded-lg overflow-hidden bg-card",
        className,
      )}
    >
      {/* Toolbar: elevation identity, status legend, and zoom controls */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border bg-muted/20">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {TEMPLATE_LABELS[config.templateType]}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
            {outerWidthMm}×{outerHeightMm} mm
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/70 whitespace-nowrap hidden sm:inline">
            front elevation
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground"
            aria-hidden="true"
          >
            <LegendSwatch className="bg-card border-border" label="Draft" />
            <LegendSwatch
              className="bg-emerald-500/10 border-emerald-500/50"
              label="Mapped"
            />
            <LegendSwatch
              className="bg-amber-500/10 border-amber-500/60"
              label="Stale"
            />
            <LegendSwatch
              className="bg-amber-500/10 border-amber-500/30"
              label="Modified"
            />
          </div>

          <div className="flex items-center gap-0.5 pl-2 border-l border-border">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => zoomBy(FRONT_ELEVATION_ZOOM_STEP)}
              className="h-6 w-6 p-0"
              title="Zoom in"
              aria-label="Zoom in front elevation"
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <span
              className="min-w-9 text-center font-mono text-[10px] text-muted-foreground"
              aria-live="polite"
            >
              {Math.round(view.zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => zoomBy(1 / FRONT_ELEVATION_ZOOM_STEP)}
              className="h-6 w-6 p-0"
              title="Zoom out"
              aria-label="Zoom out front elevation"
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={resetView}
              className="h-6 w-6 p-0"
              title="Fit layout to viewport"
              aria-label="Fit layout to viewport"
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Front orthographic viewport */}
      <div
        ref={setViewportElement}
        data-testid="front-elevation-viewport"
        className="relative flex-1 min-h-[300px] overflow-hidden bg-muted/10 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <svg
          className="absolute inset-0 h-full w-full select-none"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`Front elevation of ${TEMPLATE_LABELS[config.templateType]}, ${projection.slots.length} compartments`}
          style={{
            transform: `translate(${view.offsetXPx}px, ${view.offsetYPx}px) scale(${view.zoom})`,
            transformOrigin: "center center",
          }}
        >
          {/* Structural envelope. Dividers, rack posts, beams and lips are the
              physical gaps left between the projected compartment envelopes. */}
          <rect
            x={0}
            y={0}
            width={outerWidthMm}
            height={outerHeightMm}
            className="fill-muted/40 stroke-border"
            strokeWidth={baseStrokeMm}
            rx={pxPerMm > 0 ? 3 / pxPerMm : 0}
          />

          {projection.slots.map((slot) => {
            const mapping = mappings.get(slot.slotId);
            const isStale = Boolean(mapping?.isStale);
            const isMapped = Boolean(mapping && !mapping.isStale);
            const isModified = modifiedSlotIds.has(slot.slotId);
            const isSelected = selectedSlotId === slot.slotId;
            const isFocused = focusedSlotId === slot.slotId;

            const statusLabel = isStale
              ? "stale mapping"
              : isMapped
                ? "mapped"
                : isModified
                  ? "modified"
                  : "draft";

            const label = computeFrontElevationLabelLayout({
              code: slot.code,
              secondaryLabel: mapping?.locationCode ?? null,
              widthMm: slot.widthMm,
              heightMm: slot.heightMm,
              pxPerMm,
            });
            // SVG space is top-origin: convert the world Y-up centre.
            const centerScreenYMm = slot.yMm + slot.heightMm / 2;

            const tooltipParts = [
              `${slot.code} · ${slot.name}`,
              `${slot.widthMm}×${slot.heightMm} mm`,
              statusLabel,
            ];
            if (mapping) {
              tooltipParts.push(
                `↳ ${mapping.locationCode} — ${mapping.locationName}`,
              );
            }

            return (
              <g
                key={slot.slotId}
                data-slot-id={slot.slotId}
                data-testid="front-elevation-slot"
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Compartment ${slot.code}, ${slot.name}, ${slot.widthMm} by ${slot.heightMm} millimetres, ${statusLabel}${
                  mapping ? `, mapped to ${mapping.locationName}` : ""
                }`}
                onFocus={() => setFocusedSlotId(slot.slotId)}
                onBlur={() => setFocusedSlotId(null)}
                onClick={() => handleSlotClick(slot.slotId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleSlotClick(slot.slotId);
                  }
                }}
                className="group cursor-pointer outline-none"
              >
                <title>{tooltipParts.join(" · ")}</title>

                <rect
                  x={slot.xMm}
                  y={slot.yMm}
                  width={slot.widthMm}
                  height={slot.heightMm}
                  rx={
                    pxPerMm > 0
                      ? Math.min(2 / pxPerMm, slot.widthMm / 2, slot.heightMm / 2)
                      : 0
                  }
                  strokeWidth={isSelected ? selectedStrokeMm : baseStrokeMm}
                  className={cn(
                    "transition-colors",
                    isSelected
                      ? "fill-primary/10 stroke-primary"
                      : isStale
                        ? "fill-amber-500/10 stroke-amber-500/60 group-hover:stroke-amber-500/80"
                        : isMapped
                          ? "fill-emerald-500/10 stroke-emerald-500/40 group-hover:stroke-emerald-500/60"
                          : isModified
                            ? "fill-amber-500/10 stroke-amber-500/30 group-hover:stroke-amber-500/50"
                            : "fill-card stroke-border group-hover:stroke-foreground/40",
                  )}
                />

                {isFocused && !isSelected && (
                  <rect
                    x={slot.xMm}
                    y={slot.yMm}
                    width={slot.widthMm}
                    height={slot.heightMm}
                    fill="none"
                    strokeWidth={selectedStrokeMm}
                    strokeDasharray={`${baseStrokeMm * 3} ${baseStrokeMm * 2}`}
                    className="stroke-primary"
                    pointerEvents="none"
                  />
                )}

                {label.visible && pxPerMm > 0 && (
                  <g pointerEvents="none">
                    <text
                      x={slot.centerXMm}
                      y={
                        label.showSecondary
                          ? centerScreenYMm -
                            (label.fontSizePx / pxPerMm) * 0.35
                          : centerScreenYMm
                      }
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-mono font-bold fill-foreground"
                      fontSize={label.fontSizePx / pxPerMm}
                    >
                      {label.codeText}
                    </text>
                    {label.showSecondary && (
                      <text
                        x={slot.centerXMm}
                        y={
                          centerScreenYMm +
                          (label.fontSizePx / pxPerMm) * 0.85
                        }
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="font-mono fill-muted-foreground"
                        fontSize={label.secondaryFontSizePx / pxPerMm}
                      >
                        {label.secondaryText}
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Footer: slot count and interaction hint */}
      <div className="flex items-center justify-between gap-2 px-3 py-1 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
        <span className="font-mono">{projection.slots.length} slots</span>
        <span className="hidden sm:inline">
          Scroll to zoom · Drag to pan · Tab and Enter to select
        </span>
      </div>
    </div>
  );
}

function measurePinch(
  pointers: Map<number, PointerPosition>,
): PinchAnchor | null {
  const points = Array.from(pointers.values());
  const first = points[0];
  const second = points[1];
  if (!first || !second) return null;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    midX: (first.x + second.x) / 2,
    midY: (first.y + second.y) / 2,
  };
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  if (element.hasPointerCapture(pointerId)) return;
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Pointer was released between the move event and capture; safe to ignore.
  }
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={cn("inline-block size-2 rounded-[2px] border", className)} />
      {label}
    </span>
  );
}
