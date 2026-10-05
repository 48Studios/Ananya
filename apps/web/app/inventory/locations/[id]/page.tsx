"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  MapPin,
  Layers,
  Printer,
  Package,
  ExternalLink,
  Eye,
  Info,
  LayoutGrid,
  List,
  Box,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DetailChip,
  DetailField,
  DetailFields,
  DetailMono,
  DetailMuted,
  DetailText,
} from "@/components/ui/detail-field";
import { DetailTable } from "@/components/ui/detail-table";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import {
  RecordTimestamps,
  SectionCard,
  SectionCardFooter,
} from "@/components/ui/section-card";
import { StatCard } from "@/components/ui/stat-card";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { LocationForm } from "@/components/locations/location-form";
import { PrintLabelDialog } from "@/components/barcodes/print-label-dialog";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  spatialApi,
  type LocationSpatialContextDto,
  type LocationSpatialMappingSummaryDto,
} from "@/lib/api/spatial-api";
import {
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";
import { getRelativeLocationPath } from "@/lib/location-provenance";
import { SpatialView, SpatialMappingDialog } from "@/components/spatial";

/**
 * Placement state of a location inside a parent spatial frame, plus the state
 * of its own container configuration. Both facts come from the API's
 * authoritative mapping summary, so the badge can never disagree with the
 * Spatial Inventory tree, the mapping dialog, or the 2D/3D viewers.
 */
function LocationMappingStatusChips({
  mapping,
}: {
  mapping: LocationSpatialMappingSummaryDto | null;
}) {
  if (!mapping) return null;

  const placementChip =
    mapping.status === "MAPPED" ? (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        title="This location is placed inside its parent's spatial frame"
      >
        <CheckCircle2 className="size-3" />
        <span>Mapped</span>
      </span>
    ) : mapping.status === "PARTIAL" ? (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
        title={`${mapping.unmappedDirectChildCount} direct sub-location(s) have no spatial node`}
      >
        <span className="font-mono text-[10px]">◐</span>
        <span>
          Mapped · {mapping.mappedDirectChildCount}/{mapping.directChildCount}{" "}
          compartments
        </span>
      </span>
    ) : mapping.status === "ROOT" ? (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
        title="Top-level facility: it has no parent frame to be placed in"
      >
        <MapPin className="size-3" />
        <span>Facility root</span>
      </span>
    ) : mapping.slotMapping?.isStale ? (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
        title={`Mapped to slot ${mapping.slotMapping.slotCode} of ${mapping.slotMapping.layoutCode}, flagged for review`}
      >
        <AlertTriangle className="size-3" />
        <span>Mapping needs review</span>
      </span>
    ) : mapping.slotMapping?.layoutStatus === "DRAFT" ? (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400"
        title={`Mapped to slot ${mapping.slotMapping.slotCode} of draft layout ${mapping.slotMapping.layoutCode}; not published yet`}
      >
        <span className="font-mono text-[10px]">◐</span>
        <span>Draft slot mapping</span>
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
        title="No spatial node: this location is not placed in its parent's frame"
      >
        <AlertTriangle className="size-3 text-amber-500" />
        <span>Unmapped</span>
      </span>
    );

  const containerChip =
    mapping.containerStatus === "NONE" ? null : (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300"
        title={
          mapping.publishedLayout
            ? `Configures published layout ${mapping.publishedLayout.code} · revision ${mapping.publishedLayout.revision} · ${mapping.publishedLayout.totalCompartments} compartments`
            : "Configures a draft spatial layout for its compartments"
        }
      >
        <Layers className="size-3" />
        <span>
          {mapping.containerStatus === "PUBLISHED"
            ? "Layout published"
            : mapping.containerStatus === "DRAFT"
              ? "Layout draft"
              : "Layout archived"}
        </span>
      </span>
    );

  return (
    <>
      {placementChip}
      {containerChip}
    </>
  );
}

/**
 * One storage location, as a master-data record.
 *
 * Locations are hierarchical like categories, so the page shows where the
 * location sits, what is stored in it, and what is stored directly beneath it.
 * The location's kind is a classification, not a status, so it is rendered as a
 * neutral chip rather than as a colour-coded badge.
 */
export default function ViewLocationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;

  const focusLocationId = searchParams?.get("focusLocation") || undefined;
  const focusComponentId = searchParams?.get("focusComponent") || undefined;
  const initialView =
    searchParams?.get("view") === "list"
      ? "list"
      : searchParams?.get("view") === "spatial3d" || searchParams?.get("view") === "3d"
        ? "spatial3d"
        : "spatial";
  const [subLocationView, setSubLocationView] = React.useState<
    "spatial" | "spatial3d" | "list"
  >(initialView);

  /**
   * Latest view the operator selected through the canvas toggle.
   *
   * The App Router applies URL writes asynchronously, so a write from an earlier
   * click can land after a later one. Without this guard the stale query string
   * re-applies the previous view and the canvas silently switches back.
   */
  const pendingViewRef = React.useRef<"spatial" | "spatial3d" | "list" | null>(
    null,
  );

  const handleViewChange = React.useCallback(
    (newView: "spatial" | "spatial3d" | "list") => {
      // Remember the operator's latest choice: the URL write is asynchronous and
      // an earlier navigation can land after this one.
      pendingViewRef.current = newView;
      setSubLocationView(newView);
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (newView === "spatial3d") {
        params.set("view", "spatial3d");
      } else if (newView === "list") {
        params.set("view", "list");
      } else {
        params.delete("view");
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  const handleNavigateLocation = React.useCallback(
    (targetLocationId: string) => {
      const params = new URLSearchParams();
      if (subLocationView === "spatial3d") {
        params.set("view", "spatial3d");
      } else if (subLocationView === "list") {
        params.set("view", "list");
      }
      if (focusComponentId) {
        params.set("focusComponent", focusComponentId);
      }
      const qs = params.toString();
      router.push(`/inventory/locations/${targetLocationId}${qs ? `?${qs}` : ""}`);
    },
    [router, subLocationView, focusComponentId],
  );

  // Synchronize view mode with query parameters (e.g. from QR scan deep links)
  React.useEffect(() => {
    const viewParam = searchParams?.get("view");
    const urlView: "spatial" | "spatial3d" | "list" =
      viewParam === "spatial3d" || viewParam === "3d"
        ? "spatial3d"
        : viewParam === "list"
          ? "list"
          : "spatial";

    const pending = pendingViewRef.current;
    if (pending) {
      if (urlView === pending) {
        // The URL caught up with the operator's choice.
        pendingViewRef.current = null;
      } else {
        // A stale write from an earlier click landed; drop it and restore the
        // operator's latest view instead of following the URL backwards.
        handleViewChange(pending);
        return;
      }
    }

    if (viewParam === "spatial3d" || viewParam === "3d") {
      setSubLocationView("spatial3d");
    } else if (viewParam === "list") {
      setSubLocationView("list");
    } else if (viewParam === "spatial" || focusLocationId || focusComponentId) {
      // A focused location/component deep link opens the spatial canvas, but an
      // explicit `view` parameter always wins.
      setSubLocationView("spatial");
    }
  }, [searchParams, focusLocationId, focusComponentId, handleViewChange]);

  const [location, setLocation] = React.useState<LocationDto | null>(null);
  const [allLocations, setAllLocations] = React.useState<LocationDto[]>([]);
  const [projections, setProjections] = React.useState<
    InventoryProjectionDto[]
  >([]);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [spatialContext, setSpatialContext] =
    React.useState<LocationSpatialContextDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Spatial Mapping state
  const [isSpatialMappingOpen, setIsSpatialMappingOpen] = React.useState(false);
  const [spatialViewVersion, setSpatialViewVersion] = React.useState(0);

  // Label Printing states
  const [isPrintLocationOpen, setIsPrintLocationOpen] = React.useState(false);
  const [selectedCompForPrint, setSelectedCompForPrint] =
    React.useState<ComponentDto | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [locData, locList, locProjections, compList, catList, spatialCtx] =
        await Promise.all([
          locationsApi.getById(id),
          locationsApi.getAll().catch(() => []),
          inventoryProjectionsApi.getByLocation(id).catch(() => []),
          componentsApi.getAll().catch(() => []),
          categoriesApi.getAll().catch(() => []),
          spatialApi
            .getLocationSpatialContext(id)
            .catch(() => null),
        ]);
      setLocation(locData);
      setAllLocations(locList);
      setProjections(locProjections);
      setComponents(compList);
      setCategories(catList);
      setSpatialContext(spatialCtx);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load location details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const componentMap = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of components) {
      map.set(c.id, c);
    }
    return map;
  }, [components]);

  const categoryMap = React.useMemo(() => {
    const map = new Map<string, CategoryDto>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  const parentLocation = React.useMemo(() => {
    if (!location?.parentId) return null;
    return allLocations.find((l) => l.id === location.parentId) || null;
  }, [location, allLocations]);

  const childLocations = React.useMemo(() => {
    if (!location?.id) return [];
    return allLocations.filter((l) => l.parentId === location.id);
  }, [location, allLocations]);

  const mappingSummary = spatialContext?.mapping ?? null;

  /**
   * The spatial canvas is mounted for any location that has something to show:
   * its own nested compartments, or a spatial node that places it inside an
   * ancestor's frame (the canvas resolves that ancestor and keeps this location
   * selected). Locations with neither keep the explanatory fallback.
   */
  const hasSpatialView =
    childLocations.length > 0 || Boolean(spatialContext?.node);

  const locationPath = React.useMemo(() => {
    if (!location) return "";
    const parts: string[] = [location.name];
    let currentParentId = location.parentId;
    const visited = new Set<string>();
    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = allLocations.find((l) => l.id === currentParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      currentParentId = parent.parentId;
    }
    return parts.join(" / ");
  }, [location, allLocations]);

  const totalUnits = React.useMemo(() => {
    return projections.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
  }, [projections]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await locationsApi.delete(id);
      router.push("/inventory/locations");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Failed to delete location");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading location details..." />;
  }

  if (error || !location) {
    return (
      <ErrorState
        title="Location Not Found"
        message={error || "The requested location does not exist."}
        onRetry={fetchData}
      />
    );
  }

  const storageSummary = (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <StatCard
        className="p-3.5"
        title="Stored Components"
        value={projections.length}
        subtitle="Distinct items on hand"
        icon={Package}
      />
      <StatCard
        className="p-3.5"
        title="Total Units"
        value={totalUnits}
        subtitle="Physical units stored"
        icon={Layers}
      />
      <StatCard
        className="p-3.5"
        title="Sub-Locations"
        value={childLocations.length}
        subtitle="Nested storage zones"
        icon={MapPin}
      />
    </div>
  );

  const locationInfoSection = (
    <SectionCard
      title="Location Information"
      description="Master record properties and hierarchy position."
      icon={Info}
      contentClassName="p-0"
    >
      <DetailFields className="px-6 py-5">
        <DetailField label="Location ID">
          <DetailChip mono>{location.id}</DetailChip>
        </DetailField>

        <DetailField label="Status">
          <RecordStatusBadge isActive={location.isActive} />
        </DetailField>

        <DetailField label="Location Code">
          <DetailMono className="uppercase">{location.code}</DetailMono>
        </DetailField>

        <DetailField label="Location Name">
          <DetailText>{location.name}</DetailText>
        </DetailField>

        <DetailField label="Kind">
          <DetailChip className="capitalize">{location.kind}</DetailChip>
        </DetailField>

        <DetailField label="Hierarchy Path">
          <DetailMono>{locationPath}</DetailMono>
        </DetailField>

        <DetailField label="Parent Location">
          {parentLocation ? (
            <Link
              href={`/inventory/locations/${parentLocation.id}`}
              className="font-mono text-xs font-semibold text-primary hover:underline break-words"
            >
              {parentLocation.code} ({parentLocation.name})
            </Link>
          ) : (
            <DetailMuted>Top-level location</DetailMuted>
          )}
        </DetailField>

        <DetailField label="QR Identifier Payload">
          <DetailMono className="text-muted-foreground">
            ANANYA:V1:LOCATION:{location.id}
          </DetailMono>
        </DetailField>
      </DetailFields>

      <SectionCardFooter>
        <RecordTimestamps
          createdAt={location.createdAt}
          updatedAt={location.updatedAt}
        />
      </SectionCardFooter>
    </SectionCard>
  );

  const containingComponentsSection = (
    <SectionCard
      title="Containing Components & Stock"
      description="Components stored here and in descendant locations. Each item shows its actual location."
      icon={Package}
      contentClassName="p-0"
      actions={
        projections.length > 0 ? (
          <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
            {projections.length} {projections.length === 1 ? "item" : "items"}{" "}
            · {totalUnits} {totalUnits === 1 ? "unit" : "units"}
          </span>
        ) : null
      }
    >
      {projections.length > 0 ? (
        <DetailTable
          rows={projections}
          rowKey={(projection) => projection.id}
          columns={[
            {
              key: "component",
              header: "Component / SKU",
              width: "34%",
              className: "min-w-0",
              render: (projection) => {
                const component = componentMap.get(projection.componentId);
                const sourcePath = getRelativeLocationPath(
                  projection.locationId,
                  location.id,
                  allLocations,
                );
                return (
                  <>
                    <Link
                      href={`/inventory/components/${projection.componentId}`}
                      className="flex items-center gap-1.5 font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {component ? component.sku : projection.componentId}
                      <ExternalLink className="size-3 opacity-60" />
                    </Link>
                    <span className="text-xs text-foreground truncate block">
                      {component ? component.name : "Inventory Item"}
                    </span>
                    {sourcePath?.length === 0 ? (
                      <DetailChip className="mt-1">Direct</DetailChip>
                    ) : (
                      <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <MapPin
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                        <span className="shrink-0">From</span>
                        {sourcePath && sourcePath.length > 0 ? (
                          <span className="flex min-w-0 flex-wrap items-center gap-x-1">
                            {sourcePath.map((sourceLocation, index) => (
                              <React.Fragment key={sourceLocation.id}>
                                {index > 0 ? (
                                  <span aria-hidden="true">/</span>
                                ) : null}
                                <Link
                                  href={`/inventory/locations/${sourceLocation.id}`}
                                  className="break-words underline-offset-2 hover:text-foreground hover:underline"
                                >
                                  {sourceLocation.name}
                                </Link>
                              </React.Fragment>
                            ))}
                          </span>
                        ) : (
                          <span>Location unavailable</span>
                        )}
                      </span>
                    )}
                  </>
                );
              },
            },
            {
              key: "category",
              header: "Category",
              width: "24%",
              className: "min-w-0",
              render: (projection) => {
                const component = componentMap.get(projection.componentId);
                const category = component?.categoryId
                  ? categoryMap.get(component.categoryId)
                  : null;
                return category ? (
                  <span className="text-xs text-foreground truncate block">
                    {category.name}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                );
              },
            },
            {
              key: "quantity",
              header: "Quantity On Hand",
              align: "right",
              width: "22%",
              className: "whitespace-nowrap",
              render: (projection) => {
                const component = componentMap.get(projection.componentId);
                return (
                  <span className="inline-flex items-center rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    {projection.quantity}{" "}
                    {projection.unitOfMeasure || component?.unit || "units"}
                  </span>
                );
              },
            },
            {
              key: "actions",
              header: "",
              align: "right",
              width: "20%",
              className: "whitespace-nowrap",
              render: (projection) => {
                const component = componentMap.get(projection.componentId);
                return (
                  <div className="flex items-center justify-end gap-1">
                    {component ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Print component label"
                        aria-label="Print component label"
                        onClick={() => setSelectedCompForPrint(component)}
                      >
                        <Printer className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </Button>
                    ) : null}
                    <Link href={`/inventory/components/${projection.componentId}`}>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="View component"
                        aria-label="View component"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      </Button>
                    </Link>
                  </div>
                );
              },
            },
          ]}
        />
      ) : (
        <p className="px-6 py-5 text-xs text-muted-foreground">
          No components are stored in this location. Inward stock using Goods
          Receipts, Initial Stock, or Warehouse Transfers to assign inventory
          here.
        </p>
      )}
    </SectionCard>
  );

  const subLocationsSection = (
    <SectionCard
      title="Sub-Locations & Spatial Layout"
      description="Physical storage compartments and nested zones under this location."
      icon={Layers}
      // The detail panel is a viewport-fixed overlay (it is not clipped by this
      // card), so the card keeps its standard surface.
      contentClassName={subLocationView !== "list" && hasSpatialView ? "p-4" : "p-0"}
      actions={
        childLocations.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {childLocations.length}{" "}
              {childLocations.length === 1 ? "compartment" : "compartments"}
            </span>
            {subLocationView === "list" ? (
              <Button
                variant="outline"
                size="xs"
                onClick={() => handleViewChange("spatial")}
                className="h-6 px-2 text-xs font-medium gap-1"
                title="Switch to spatial visual layout"
              >
                <LayoutGrid className="size-3.5" />
                <span>Spatial View</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleViewChange("list")}
                className="h-6 px-2 text-xs font-medium gap-1 text-muted-foreground hover:text-foreground"
                title="Switch to tabular list of sub-locations"
              >
                <List className="size-3.5" />
                <span>Table View</span>
              </Button>
            )}
          </div>
        ) : null
      }
    >
      {hasSpatialView ? (
        childLocations.length === 0 ||
        subLocationView === "spatial" ||
        subLocationView === "spatial3d" ? (
          <SpatialView
            key={`${location.id}-${spatialViewVersion}`}
            locationId={location.id}
            allLocations={allLocations}
            focusLocationId={focusLocationId}
            focusComponentId={focusComponentId}
            viewMode={subLocationView === "spatial3d" ? "3d" : "2d"}
            onViewModeChange={(m) => {
              handleViewChange(m === "3d" ? "spatial3d" : "spatial");
            }}
            onNavigateLocation={handleNavigateLocation}
            onOpenMapping={() => setIsSpatialMappingOpen(true)}
          />
        ) : (
          <DetailTable
            rows={childLocations}
            rowKey={(child) => child.id}
            columns={[
              {
                key: "code",
                header: "Code",
                width: "20%",
                render: (child) => (
                  <DetailChip mono className="uppercase">
                    {child.code}
                  </DetailChip>
                ),
              },
              {
                key: "name",
                header: "Name",
                width: "38%",
                className: "min-w-0",
                render: (child) => (
                  <span className="text-sm text-foreground truncate block">
                    {child.name}
                  </span>
                ),
              },
              {
                key: "kind",
                header: "Kind",
                width: "16%",
                render: (child) => (
                  <DetailChip className="capitalize">{child.kind}</DetailChip>
                ),
              },
              {
                key: "status",
                header: "Status",
                width: "14%",
                className: "whitespace-nowrap",
                render: (child) => (
                  <RecordStatusBadge isActive={child.isActive} />
                ),
              },
              {
                key: "actions",
                header: "",
                align: "right",
                width: "12%",
                render: (child) => (
                  <Link href={`/inventory/locations/${child.id}`}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="View sub-location"
                      aria-label="View sub-location"
                    >
                      <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  </Link>
                ),
              },
            ]}
          />
        )
      ) : (
        <p className="px-6 py-5 text-xs text-muted-foreground">
          No sub-locations are nested under this location yet. Map this location
          into its parent&apos;s frame to give it a spatial view.
        </p>
      )}
    </SectionCard>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref="/inventory/locations"
        backLabel="Back to Locations"
        title={location.name}
        description={parentLocation ? locationPath : `Code: ${location.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LocationMappingStatusChips mapping={mappingSummary} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPrintLocationOpen(true)}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print Label
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSpatialMappingOpen(true)}
            >
              <Box className="w-4 h-4 mr-1.5" />
              Spatial Mapping
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/inventory/locations/spatial-builder?mode=map&location=${location.id}`)}
            >
              <Sliders className="w-4 h-4 mr-1.5" />
              Builder Workspace
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <Edit3 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setIsDeleteOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete
            </Button>
          </div>
        }
      />

      {/* Delete Error Notification */}
      {deleteError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {deleteError}
        </div>
      )}

      {/*
       * One canonical section order regardless of the location's kind or data.
       * Empty sections keep their card and state the fact in one line; they
       * never move later sections or reorder the page.
       */}
      {storageSummary}
      {locationInfoSection}
      {containingComponentsSection}
      {subLocationsSection}

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Location"
        description={`Update the storage location "${location.code}" and keep its hierarchy assignment aligned.`}
        size="sm"
      >
        <LocationForm
          initialData={location}
          locations={allLocations}
          onSuccess={(updated) => {
            setLocation(updated);
            setIsEditOpen(false);
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Location"
        description={`Are you sure you want to delete location "${location.code}" (${location.name})? This action cannot be undone.`}
        confirmText="Delete Location"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />

      {/* Spatial Mapping Modal */}
      {location && (
        <SpatialMappingDialog
          locationId={location.id}
          open={isSpatialMappingOpen}
          onOpenChange={setIsSpatialMappingOpen}
          onSuccess={() => {
            fetchData();
            setSpatialViewVersion((v) => v + 1);
          }}
        />
      )}

      {/* Print Location Tag Modal */}
      <PrintLabelDialog
        isOpen={isPrintLocationOpen}
        onClose={() => setIsPrintLocationOpen(false)}
        entityType="LOCATION"
        entityId={location.id}
        defaultTemplate="SHELF_BIN"
        title={`Print Location Tag: ${location.code}`}
      />

      {/* Print Component Label Modal (from containing components table) */}
      {selectedCompForPrint && (
        <PrintLabelDialog
          isOpen={!!selectedCompForPrint}
          onClose={() => setSelectedCompForPrint(null)}
          entityType="COMPONENT"
          entityId={selectedCompForPrint.id}
          defaultTemplate="STANDARD"
          title={`Print Component Label: ${selectedCompForPrint.sku}`}
        />
      )}
    </div>
  );
}
