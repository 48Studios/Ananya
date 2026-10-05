import type { SpatialContainerStatusDto } from "../api/spatial-api";

/**
 * The subset of a location's operational view that decides whether the location
 * can render a frame of its own: nested sub-locations, an own model, or an own
 * layout.
 */
export interface SpatialFrameViewInput {
  children: ReadonlyArray<unknown>;
  parent: {
    model: unknown;
    mapping: { containerStatus: SpatialContainerStatusDto };
  };
}

/**
 * Which spatial frame a request should render, and which compartment inside it
 * the operator asked for.
 *
 * These are two distinct concepts that must never be conflated:
 * - `requestedLocationId` is the location the operator opened. It stays
 *   authoritative for the URL, breadcrumbs, and sidebar.
 * - `contextLocationId` is the location whose frame is actually rendered. It is
 *   the requested location whenever that location has a frame of its own, and
 *   otherwise the nearest ancestor frame that directly contains it.
 */
export interface SpatialViewContextResolution {
  requestedLocationId: string;
  contextLocationId: string;
  selectedLocationId: string | null;
  /** True when an ancestor frame is rendered on behalf of a leaf location. */
  isContextView: boolean;
}

/**
 * A location can render a frame of its own when it has nested sub-locations, an
 * own model, or an own layout. Such a location is never replaced by an ancestor
 * frame — parent geometry is only used when the location has no frame of its
 * own and is mapped inside it (see `resolveSpatialViewContext`).
 */
export function hasOwnSpatialFrame(view: SpatialFrameViewInput): boolean {
  return (
    view.children.length > 0 ||
    Boolean(view.parent.model) ||
    view.parent.mapping.containerStatus !== "NONE"
  );
}

/**
 * Resolves the rendering context for a spatial view.
 *
 * The requested location is authoritative: if it has its own frame, it is
 * rendered directly and the parent is never substituted. Only a location with
 * no frame of its own that is mapped inside an ancestor's frame falls back to
 * that ancestor as the visual context, while staying the selected location —
 * the URL, breadcrumbs, and inspector must keep identifying the requested
 * location.
 */
export function resolveSpatialViewContext({
  requestedLocationId,
  requestedHasOwnFrame,
  resolvedSpatialRootLocationId,
  resolvedFocusLocationId,
}: {
  requestedLocationId: string;
  requestedHasOwnFrame: boolean;
  resolvedSpatialRootLocationId?: string | null;
  resolvedFocusLocationId?: string | null;
}): SpatialViewContextResolution {
  const contextLocationId =
    requestedHasOwnFrame ||
    !resolvedSpatialRootLocationId ||
    resolvedSpatialRootLocationId === requestedLocationId
      ? requestedLocationId
      : resolvedSpatialRootLocationId;

  if (contextLocationId === requestedLocationId) {
    return {
      requestedLocationId,
      contextLocationId,
      selectedLocationId: null,
      isContextView: false,
    };
  }

  return {
    requestedLocationId,
    contextLocationId,
    selectedLocationId: resolvedFocusLocationId || requestedLocationId,
    isContextView: true,
  };
}
