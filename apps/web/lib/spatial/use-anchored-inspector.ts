"use client";

import * as React from "react";
import {
  INSPECTOR_ANCHOR_SPACING_PX,
  INSPECTOR_MAX_WIDTH_PX,
  INSPECTOR_PREFERRED_WIDTH_PX,
  computeInspectorPlacement,
  createScreenRect,
  type InspectorPlacement,
  type InspectorPlacementResult,
  type ScreenRect,
  type Spatial3DAnchorApi,
} from "./inspector-placement";

/** Fallback used until the first measurement lands (and if measurement is impossible). */
export const DEFAULT_INSPECTOR_STYLE: React.CSSProperties = {
  top: "calc(var(--app-header-height, 3.5rem) + 1rem)",
  left: "auto",
  right: "1rem",
  width: `min(${INSPECTOR_PREFERRED_WIDTH_PX}px, calc(100vw - 2rem))`,
  maxHeight:
    "calc(100dvh - var(--app-header-height, 3.5rem) - var(--app-footer-height, 3.5rem) - 2rem)",
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export interface AnchoredInspectorOptions {
  isOpen: boolean;
  selectedLocationId: string | null;
  /** Which spatial view supplies the anchor geometry. */
  mode: "2d" | "3d";
  /** Element bounding the usable spatial viewport (the canvas region). */
  containerRef: React.RefObject<HTMLElement | null>;
  /** The inspector wrapper; pointer events inside it never dismiss the inspector. */
  wrapperRef: React.RefObject<HTMLElement | null>;
  /** Resolves the selected 2D card element used as the anchor. */
  getAnchorElement?: (locationId: string) => HTMLElement | null;
  /** 3D viewport bridge for projected bounds, hit testing, and camera changes. */
  projectionRef?: React.RefObject<Spatial3DAnchorApi | null>;
  /** Called when a pointer lands outside the inspector and outside any spatial object. */
  onDismiss?: () => void;
  preferredWidth?: number;
  maxWidth?: number;
  spacing?: number;
}

export interface AnchoredInspectorState {
  /** `null` until the first measurement; callers then use DEFAULT_INSPECTOR_STYLE. */
  placement: InspectorPlacement | null;
  style: React.CSSProperties | null;
  /** True while the anchor is actively moving, so position transitions are suppressed. */
  isFollowing: boolean;
}

function geometryEquals(
  a: InspectorPlacementResult | null,
  b: InspectorPlacementResult,
): boolean {
  return (
    a !== null &&
    a.placement === b.placement &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.maxHeight - b.maxHeight) < 1
  );
}

function anchorEquals(a: ScreenRect | null, b: ScreenRect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < 2 &&
    Math.abs(a.left - b.left) < 2 &&
    Math.abs(a.bottom - b.bottom) < 2 &&
    Math.abs(a.right - b.right) < 2
  );
}

/** Shell chrome heights, published as CSS variables by the dashboard layout. */
const FALLBACK_SHELL_HEIGHT_PX = 56;

function readShellChrome(): { header: number; footer: number } {
  if (typeof window === "undefined") {
    return { header: FALLBACK_SHELL_HEIGHT_PX, footer: FALLBACK_SHELL_HEIGHT_PX };
  }
  const styles = getComputedStyle(document.documentElement);
  const header = Number.parseFloat(
    styles.getPropertyValue("--app-header-height"),
  );
  const footer = Number.parseFloat(
    styles.getPropertyValue("--app-footer-height"),
  );
  return {
    header: Number.isFinite(header) ? header : FALLBACK_SHELL_HEIGHT_PX,
    footer: Number.isFinite(footer) ? footer : FALLBACK_SHELL_HEIGHT_PX,
  };
}

/**
 * Positions a non-modal inspector next to the selected spatial object.
 *
 * Measurements come from real rendered geometry: the 2D card's DOM rectangle or
 * the 3D scene object's projected bounds. Placement is recomputed on selection
 * changes, scroll, resize, and 3D camera movement, and is throttled to one
 * animation frame with a movement threshold so orbiting never causes jitter or
 * unnecessary React renders.
 */
export function useAnchoredInspector(
  options: AnchoredInspectorOptions,
): AnchoredInspectorState {
  const {
    isOpen,
    selectedLocationId,
    mode,
    containerRef,
    wrapperRef,
    getAnchorElement,
    projectionRef,
    onDismiss,
    preferredWidth = INSPECTOR_PREFERRED_WIDTH_PX,
    maxWidth = INSPECTOR_MAX_WIDTH_PX,
    spacing = INSPECTOR_ANCHOR_SPACING_PX,
  } = options;

  const [geometry, setGeometry] =
    React.useState<InspectorPlacementResult | null>(null);
  const [isFollowing, setIsFollowing] = React.useState(false);

  const lastAnchorRef = React.useRef<ScreenRect | null>(null);
  const followTimerRef = React.useRef<number | null>(null);
  const geometryRef = React.useRef<InspectorPlacementResult | null>(null);

  const resolveAnchor = React.useCallback((): ScreenRect | null => {
    if (!selectedLocationId) return null;

    if (mode === "3d") {
      const projected =
        projectionRef?.current?.projectLocationBounds(selectedLocationId) ??
        null;
      if (projected) return projected;
    }

    const element = getAnchorElement?.(selectedLocationId) ?? null;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return createScreenRect(rect.top, rect.left, rect.right, rect.bottom);
  }, [selectedLocationId, mode, projectionRef, getAnchorElement]);

  const measure = React.useCallback(() => {
    if (typeof window === "undefined" || !isOpen) return;

    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    if (containerRect.width === 0) return;

    // The inspector is constrained to the usable application content area: the
    // canvas region owns the horizontal span (so it never covers the navigation
    // rail) while the shell's header/footer bands bound it vertically. A short
    // 2D card row therefore still yields a usable panel instead of a sliver, and
    // the panel is never clipped by the canvas container.
    const chrome = readShellChrome();
    const anchor = resolveAnchor();
    const next = computeInspectorPlacement({
      anchor,
      bounds: createScreenRect(
        chrome.header,
        containerRect.left,
        containerRect.right,
        window.innerHeight - chrome.footer,
      ),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      preferredWidth,
      maxWidth,
      spacing,
    });

    // Skip renders when neither the anchor nor the resulting geometry moved.
    if (
      anchorEquals(lastAnchorRef.current, anchor) &&
      geometryEquals(geometryRef.current, next)
    ) {
      return;
    }

    lastAnchorRef.current = anchor;
    geometryRef.current = next;
    setGeometry(next);
  }, [
    isOpen,
    containerRef,
    resolveAnchor,
    preferredWidth,
    maxWidth,
    spacing,
  ]);

  const markFollowing = React.useCallback(() => {
    if (typeof window === "undefined") return;
    setIsFollowing(true);
    if (followTimerRef.current !== null) {
      window.clearTimeout(followTimerRef.current);
    }
    followTimerRef.current = window.setTimeout(() => {
      followTimerRef.current = null;
      setIsFollowing(false);
    }, 200);
  }, []);

  // Selection / mode changes reposition immediately (and may animate).
  useIsomorphicLayoutEffect(() => {
    if (!isOpen || !selectedLocationId) {
      lastAnchorRef.current = null;
      if (followTimerRef.current !== null) {
        window.clearTimeout(followTimerRef.current);
        followTimerRef.current = null;
      }
      setIsFollowing(false);
      setGeometry(null);
      geometryRef.current = null;
      return;
    }

    // Selection changes are discrete: let the panel animate into its new spot.
    // Continuous follow states (scroll, resize, camera) suppress transitions.
    if (followTimerRef.current !== null) {
      window.clearTimeout(followTimerRef.current);
      followTimerRef.current = null;
    }
    setIsFollowing(false);
    measure();
  }, [isOpen, selectedLocationId, mode, measure]);

  // Keep the inspector glued to the anchor while the viewport, page, or camera moves.
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined" || !isOpen || !selectedLocationId) return;
    const container = containerRef.current;
    if (!container) return;

    let frame: number | null = null;
    const schedule = () => {
      markFollowing();
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };

    const resizeObserver = new ResizeObserver(() => schedule());
    resizeObserver.observe(container);
    const anchorElement = getAnchorElement?.(selectedLocationId) ?? null;
    if (anchorElement) resizeObserver.observe(anchorElement);

    window.addEventListener("resize", schedule);
    // Capture phase: scroll events do not bubble out of the shell's scroll container.
    document.addEventListener("scroll", schedule, true);

    const unsubscribe =
      mode === "3d"
        ? projectionRef?.current?.subscribeSceneMovement(schedule)
        : undefined;

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      unsubscribe?.();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [
    isOpen,
    selectedLocationId,
    mode,
    containerRef,
    getAnchorElement,
    projectionRef,
    measure,
    markFollowing,
  ]);

  // Dismiss on click activity outside the inspector and outside any spatial object.
  // `click` (not `pointerdown`) is deliberate: an orbit drag on empty canvas ends
  // with a pointerup far from its start and must never dismiss the inspector.
  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen || !onDismiss) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (wrapperRef.current?.contains(target)) return;
      // Another spatial object owns the click: it switches the selection instead.
      if (target.closest("[data-spatial-location-id]")) return;
      // Chrome and controls (camera presets, view toggles, cards, nav links) are
      // part of the working surface: clicking them must never dismiss the panel.
      if (
        target.closest(
          "button, a, input, select, textarea, [role='button'], [role='menuitem'], [role='tab'], [role='switch'], [role='checkbox']",
        )
      ) {
        return;
      }
      if (
        target.closest(
          '[role="dialog"], [role="alertdialog"], [role="menu"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      if (
        projectionRef?.current?.hitTestSpatialObject(
          event.clientX,
          event.clientY,
        )
      ) {
        return;
      }
      onDismiss();
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isOpen, onDismiss, wrapperRef, projectionRef]);

  React.useEffect(
    () => () => {
      if (followTimerRef.current !== null) {
        window.clearTimeout(followTimerRef.current);
      }
    },
    [],
  );

  return React.useMemo<AnchoredInspectorState>(() => {
    if (!geometry) {
      return { placement: null, style: null, isFollowing: false };
    }
    return {
      placement: geometry.placement,
      style: {
        top: geometry.top,
        left: geometry.left,
        right: "auto",
        width: geometry.width,
        maxHeight: geometry.maxHeight,
      },
      isFollowing,
    };
  }, [geometry, isFollowing]);
}
