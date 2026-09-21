"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  MapPin,
  Layers,
  ArrowLeft,
  Printer,
  Package,
  ExternalLink,
  Info,
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
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { categoriesApi, type CategoryDto } from "@/lib/api/categories-api";

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
  const id = params?.id as string;

  const [location, setLocation] = React.useState<LocationDto | null>(null);
  const [allLocations, setAllLocations] = React.useState<LocationDto[]>([]);
  const [projections, setProjections] = React.useState<
    InventoryProjectionDto[]
  >([]);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [categories, setCategories] = React.useState<CategoryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Label Printing states
  const [isPrintLocationOpen, setIsPrintLocationOpen] = React.useState(false);
  const [selectedCompForPrint, setSelectedCompForPrint] =
    React.useState<ComponentDto | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [locData, locList, locProjections, compList, catList] =
        await Promise.all([
          locationsApi.getById(id),
          locationsApi.getAll().catch(() => []),
          inventoryProjectionsApi.getByLocation(id).catch(() => []),
          componentsApi.getAll().catch(() => []),
          categoriesApi.getAll().catch(() => []),
        ]);
      setLocation(locData);
      setAllLocations(locList);
      setProjections(locProjections);
      setComponents(compList);
      setCategories(catList);
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
      router.push("/locations");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={location.name}
        // A nested location is identified by its path; a root location has no
        // path to show, so it carries its code instead of repeating its name.
        description={
          parentLocation ? locationPath : `Code: ${location.code}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/locations")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
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

      {/* Storage Summary */}
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

      {/* Location Information */}
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
                href={`/locations/${parentLocation.id}`}
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

      {/* Containing Components & Stock */}
      <SectionCard
        title="Containing Components & Stock"
        description={`Components physically stored in this ${location.kind}.`}
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
                  return (
                    <>
                      <Link
                        href={`/components/${projection.componentId}`}
                        className="flex items-center gap-1.5 font-mono text-xs font-semibold text-primary hover:underline"
                      >
                        {component ? component.sku : projection.componentId}
                        <ExternalLink className="size-3 opacity-60" />
                      </Link>
                      <span className="text-xs text-foreground truncate block">
                        {component ? component.name : "Inventory Item"}
                      </span>
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
                    <div className="flex items-center justify-end gap-1.5">
                      {component ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          title="Print component label"
                          onClick={() => setSelectedCompForPrint(component)}
                        >
                          <Printer className="size-3.5 mr-1 text-muted-foreground" />
                          Label
                        </Button>
                      ) : null}
                      <Link href={`/components/${projection.componentId}`}>
                        <Button variant="outline" size="xs">
                          View
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

      {/* Sub-Locations */}
      <SectionCard
        title="Sub-Locations"
        description="Storage zones nested directly under this location."
        icon={Layers}
        contentClassName="p-0"
        actions={
          childLocations.length > 0 ? (
            <span className="rounded bg-muted/50 px-2.5 py-1 font-mono text-xs font-medium text-muted-foreground">
              {childLocations.length}{" "}
              {childLocations.length === 1 ? "location" : "locations"}
            </span>
          ) : null
        }
      >
        {childLocations.length > 0 ? (
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
                  <Link href={`/locations/${child.id}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <p className="px-6 py-5 text-xs text-muted-foreground">
            No sub-locations are nested under this location yet.
          </p>
        )}
      </SectionCard>

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
