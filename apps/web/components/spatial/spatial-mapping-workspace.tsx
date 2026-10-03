"use client";

import * as React from "react";
import Link from "next/link";
import {
  Box,
  MapPin,
  ExternalLink,
  Edit3,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Maximize2,
  ArrowRight,
  Anchor as AnchorIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  spatialApi,
  type LocationMappingContextDto,
  type LocationLocateTargetDto,
} from "@/lib/api/spatial-api";
import { cn } from "@/lib/utils";

export interface SpatialMappingWorkspaceProps {
  locationId: string | null;
  onOpenMapping: (targetLocationId: string) => void;
  onSelectLocation: (targetLocationId: string) => void;
  className?: string;
}

export function SpatialMappingWorkspace({
  locationId,
  onOpenMapping,
  onSelectLocation,
  className,
}: SpatialMappingWorkspaceProps) {
  const [context, setContext] = React.useState<LocationMappingContextDto | null>(null);
  const [locateTarget, setLocateTarget] = React.useState<LocationLocateTargetDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchContext = React.useCallback(async (locId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [mappingCtx, locateRes] = await Promise.all([
        spatialApi.getLocationMappingContext(locId),
        spatialApi.resolveLocationLocate(locId).catch(() => null),
      ]);
      setContext(mappingCtx);
      setLocateTarget(locateRes);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load location mapping details.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (locationId) {
      fetchContext(locationId);
    } else {
      setContext(null);
      setLocateTarget(null);
    }
  }, [locationId, fetchContext]);

  // Empty state when no location is selected
  if (!locationId) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full p-8 text-center bg-card border border-border rounded-lg",
          className,
        )}
      >
        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
          <Layers className="size-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">
          No Location Selected
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
          Select a warehouse, room, cabinet, or storage node from the hierarchy tree
          on the left to inspect, preview, and configure its physical spatial mapping.
        </p>
        <div className="flex items-center gap-3">
          <Link href="/inventory/locations/spatial-models">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Box className="size-3.5" />
              <span>Open Spatial Models</span>
            </Button>
          </Link>
          <Link href="/inventory/locations">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
              <MapPin className="size-3.5" />
              <span>Locations Directory</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full p-8 bg-card border border-border rounded-lg",
          className,
        )}
      >
        <LoadingState message="Loading spatial mapping context..." />
      </div>
    );
  }

  if (error || !context) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full p-8 bg-card border border-border rounded-lg",
          className,
        )}
      >
        <ErrorState
          title="Could not load location mapping"
          message={error || "Location details unavailable"}
          onRetry={() => locationId && fetchContext(locationId)}
        />
      </div>
    );
  }

  const { location, node, model, anchor, parentLocation, children, modelAnchors } =
    context;
  const isMapped = Boolean(node);
  const totalChildren = children.length;
  const mappedChildren = children.filter((c) => c.isMapped).length;
  const isPartial = isMapped && totalChildren > 0 && mappedChildren < totalChildren;

  // Build anchor -> child mapping for 2D Preview
  const anchorChildMap = new Map<
    string,
    { id: string; code: string; name: string; isMapped: boolean }
  >();
  for (const c of children) {
    if (c.anchor) {
      anchorChildMap.set(c.anchor.id, {
        id: c.location.id,
        code: c.location.code,
        name: c.location.name,
        isMapped: c.isMapped,
      });
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card border border-border rounded-lg overflow-y-auto space-y-4 p-4",
        className,
      )}
    >
      {/* 1. Header Card */}
      <div className="p-4 bg-muted/20 border border-border rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base font-bold text-foreground">
              {location.code}
            </span>
            <span className="text-sm text-muted-foreground font-medium">
              {location.name}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border border-primary/20">
              {location.kind}
            </span>
            {isMapped ? (
              isPartial ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  <span className="font-mono">◐</span>
                  <span>Mapped ({mappedChildren}/{totalChildren} children)</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="size-3" />
                  <span>Mapped</span>
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                <AlertTriangle className="size-3 text-amber-500" />
                <span>Unmapped</span>
              </span>
            )}
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>Parent:</span>
            {parentLocation ? (
              <button
                type="button"
                onClick={() => onSelectLocation(parentLocation.id)}
                className="font-mono font-medium text-foreground hover:underline"
              >
                {parentLocation.code} ({parentLocation.name})
              </button>
            ) : (
              <span className="italic font-medium">Top Level (Facility Root)</span>
            )}
            <span>•</span>
            <span>{totalChildren} direct sub-locations</span>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            size="sm"
            variant={isMapped ? "outline" : "default"}
            onClick={() => onOpenMapping(location.id)}
            className="gap-1.5 text-xs"
          >
            <Edit3 className="size-3.5" />
            <span>{isMapped ? "Edit Mapping" : "Map Location"}</span>
          </Button>

          {locateTarget?.hasSpatialView && (
            <Link href={locateTarget.locateUrl}>
              <Button size="sm" variant="default" className="gap-1.5 text-xs">
                <MapPin className="size-3.5" />
                <span>Open Spatial View</span>
                <ExternalLink className="size-3 ml-0.5" />
              </Button>
            </Link>
          )}

          <Link href={`/inventory/locations/${location.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <span>Open Location</span>
              <ExternalLink className="size-3" />
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Spatial Mapping Configuration Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Card */}
        <div className="p-3.5 bg-background border border-border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Box className="size-3.5 text-primary" />
              Physical Model
            </span>
            {model && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {model.format}
              </span>
            )}
          </div>

          {model ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Model Name:</span>
                <span className="font-semibold text-foreground">{model.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Model Code:</span>
                <span className="font-mono font-medium text-foreground">{model.code}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Dimensions:</span>
                <span className="font-mono text-muted-foreground">
                  {model.widthMm ?? "—"} × {model.heightMm ?? "—"} ×{" "}
                  {model.depthMm ?? "—"} mm
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Configured Anchors:</span>
                <span className="font-mono font-semibold text-foreground">
                  {modelAnchors.length} anchors
                </span>
              </div>
            </div>
          ) : (
            <div className="py-2 text-xs text-muted-foreground space-y-1">
              <p>No Spatial Model assigned to this location.</p>
              <p className="text-[11px] text-muted-foreground/80">
                Assigning a Spatial Model allows this location to define anchors for
                sub-locations (drawers, shelves, bins).
              </p>
            </div>
          )}
        </div>

        {/* Spatial Node Placement Card */}
        <div className="p-3.5 bg-background border border-border rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <AnchorIcon className="size-3.5 text-primary" />
              Placement & Orientation
            </span>
            {node && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Active Node
              </span>
            )}
          </div>

          {node ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Parent Anchor:</span>
                <span className="font-mono font-semibold text-foreground">
                  {anchor ? `${anchor.code} (${anchor.name})` : "None (Root Placement)"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Coordinates (X, Y, Z):</span>
                <span className="font-mono text-muted-foreground">
                  {node.positionX}, {node.positionY}, {node.positionZ} mm
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Yaw (Rotation Y):</span>
                <span className="font-mono text-muted-foreground">
                  {node.rotationY}&deg;
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Node Visibility:</span>
                <span className="text-foreground">
                  {node.isVisible ? "Visible in 2D/3D" : "Hidden"}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-2 text-xs text-muted-foreground space-y-1">
              <p>Location is not currently positioned inside a spatial parent.</p>
              <p className="text-[11px] text-muted-foreground/80">
                Click &ldquo;Map Location&rdquo; above to assign this location to an
                anchor in its parent container.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 3. 2D Preview Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Maximize2 className="size-3.5 text-primary" />
            2D Spatial Preview
          </span>
          {model && (
            <span className="text-[11px] text-muted-foreground font-mono">
              Model: {model.code} ({modelAnchors.length} Anchors)
            </span>
          )}
        </div>

        {model && modelAnchors.length > 0 ? (
          <div className="p-4 bg-muted/10 border border-border rounded-lg space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {modelAnchors.map((anc) => {
                const assignedChild = anchorChildMap.get(anc.id);
                return (
                  <div
                    key={anc.id}
                    onClick={() => {
                      if (assignedChild) {
                        onSelectLocation(assignedChild.id);
                      }
                    }}
                    className={cn(
                      "p-2.5 rounded-lg border text-left transition-all flex flex-col justify-between min-h-[72px]",
                      assignedChild
                        ? "bg-card border-border hover:border-primary cursor-pointer hover:shadow-xs"
                        : "bg-muted/30 border-dashed border-border/80 text-muted-foreground",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-xs font-bold text-foreground">
                        {anc.code}
                      </span>
                      {assignedChild ? (
                        <span className="text-[9px] font-mono px-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          Assigned
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-muted-foreground">
                          Empty
                        </span>
                      )}
                    </div>

                    {assignedChild ? (
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-[11px] text-foreground block truncate">
                          {assignedChild.code}
                        </span>
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {assignedChild.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">
                        Available anchor slot
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Click any assigned slot to navigate to that sub-location in the workspace.
            </p>
          </div>
        ) : (
          <div className="p-6 text-center border border-dashed border-border rounded-lg bg-muted/10 space-y-1">
            <p className="text-xs text-muted-foreground font-medium">
              No compartmental 2D preview available.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Assign a Spatial Model with defined anchors to visualize the layout of
              sub-locations and compartments.
            </p>
          </div>
        )}
      </div>

      {/* 4. Direct Children Mapping Table */}
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" />
            Child Storage Locations ({children.length})
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {mappedChildren}/{totalChildren} mapped
          </span>
        </div>

        {children.length > 0 ? (
          <div className="border border-border rounded-lg overflow-hidden bg-card text-xs">
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              <table className="w-full text-left border-collapse">
                <thead className="bg-muted/40 sticky top-0 font-semibold text-muted-foreground text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Location Code</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">Kind</th>
                    <th className="py-2 px-3">Assigned Anchor</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {children.map((child) => (
                    <tr
                      key={child.location.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-foreground">
                        <button
                          type="button"
                          onClick={() => onSelectLocation(child.location.id)}
                          className="hover:underline text-left"
                        >
                          {child.location.code}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-foreground truncate max-w-[150px]">
                        {child.location.name}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground uppercase text-[10px] font-mono">
                        {child.location.kind}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {child.anchor ? (
                          <span className="font-semibold text-foreground">
                            {child.anchor.code}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {child.isMapped ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="size-3" />
                            <span>Mapped</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <AlertTriangle className="size-3 text-amber-500" />
                            <span>Unmapped</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => onOpenMapping(child.location.id)}
                            className="h-6 px-2 text-[11px] gap-1"
                          >
                            <Edit3 className="size-3" />
                            <span>{child.isMapped ? "Edit" : "Map"}</span>
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => onSelectLocation(child.location.id)}
                            className="h-6 px-2 text-[11px] gap-1"
                            title="Select in Workspace"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center border border-dashed border-border rounded-lg bg-muted/10">
            <p className="text-xs text-muted-foreground">
              This location does not have any direct sub-locations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
