"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  MapPin,
  Layers,
  Calendar,
  ArrowLeft,
  Printer,
  Package,
  Boxes,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
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

const kindBadgeColors: Record<string, string> = {
  warehouse:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  aisle:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  rack: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  shelf:
    "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  bin: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  drawer:
    "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
  room: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  cabinet:
    "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
};

export default function ViewLocationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [location, setLocation] = React.useState<LocationDto | null>(null);
  const [allLocations, setAllLocations] = React.useState<LocationDto[]>([]);
  const [projections, setProjections] = React.useState<InventoryProjectionDto[]>(
    [],
  );
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
      {/* Page Header */}
      <PageHeader
        title={location.name}
        description={locationPath || `Code: ${location.code}`}
        breadcrumbs={[
          { label: "Locations", href: "/locations" },
          { label: location.code },
        ]}
        actions={
          <div className="flex items-center gap-2">
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

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Location Code"
          value={location.code}
          subtitle={`Kind: ${location.kind.toUpperCase()}`}
          icon={MapPin}
        />
        <StatCard
          title="Parent Location"
          value={parentLocation ? parentLocation.code : "Top Level"}
          subtitle={
            parentLocation ? parentLocation.name : "No parent hierarchy"
          }
          icon={Layers}
        />
        <StatCard
          title="Stored Components"
          value={projections.length}
          subtitle={`${totalUnits} total physical unit(s)`}
          icon={Package}
        />
        <StatCard
          title="Sub-Locations"
          value={childLocations.length}
          subtitle={`${childLocations.length} nested child zones`}
          icon={Calendar}
        />
      </div>

      {/* Containing Components & Stock Section */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Boxes className="w-4 h-4 text-primary" />
              Containing Components & Stock
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live components and on-hand inventory stored directly in this {location.kind}.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-muted-foreground bg-muted/50 px-2.5 py-1 rounded">
            {projections.length} items • {totalUnits} total units
          </span>
        </div>

        {projections.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground font-medium text-xs border-b border-border">
                <tr>
                  <th className="px-6 py-3">Component / SKU</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3 text-right">Quantity On-Hand</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projections.map((proj) => {
                  const comp = componentMap.get(proj.componentId);
                  const cat =
                    comp?.categoryId ? categoryMap.get(comp.categoryId) : null;

                  return (
                    <tr key={proj.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex flex-col">
                          <Link
                            href={`/components/${proj.componentId}`}
                            className="font-mono text-xs font-bold text-primary hover:underline flex items-center gap-1.5"
                          >
                            {comp ? comp.sku : proj.componentId}
                            <ExternalLink className="size-3 opacity-60" />
                          </Link>
                          <span className="text-xs text-foreground mt-0.5">
                            {comp ? comp.name : "Inventory Item"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-muted-foreground">
                        {cat ? cat.name : "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-xs font-bold text-foreground">
                        <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded">
                          {proj.quantity} {proj.unitOfMeasure || comp?.unit || "units"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {comp && (
                            <Button
                              variant="ghost"
                              size="xs"
                              title="Print Component Label"
                              onClick={() => setSelectedCompForPrint(comp)}
                            >
                              <Printer className="size-3.5 mr-1 text-muted-foreground hover:text-foreground" />
                              Label
                            </Button>
                          )}
                          <Link href={`/components/${proj.componentId}`}>
                            <Button variant="outline" size="xs">
                              View
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center space-y-2">
            <Package className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              No components currently stored in this location
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              This storage section currently holds 0 units. Inward stock using Goods Receipts, Initial Stock, or Warehouse Transfers to assign inventory here.
            </p>
          </div>
        )}
      </div>

      {/* Location Details Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Location Master Properties
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hierarchy position and master record attributes.
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Location ID</dt>
            <dd className="mt-1 font-mono text-xs text-foreground bg-muted/40 px-2 py-1 rounded inline-block">
              {location.id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Status
            </dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  location.isActive
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {location.isActive ? "Active" : "Inactive"}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Kind</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full capitalize ${
                  kindBadgeColors[location.kind.toLowerCase()] ||
                  "bg-muted text-muted-foreground border-border"
                }`}
              >
                {location.kind}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Hierarchy Breadcrumb
            </dt>
            <dd className="mt-1 text-xs font-mono text-foreground font-semibold">
              {locationPath}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Parent Location
            </dt>
            <dd className="mt-1 text-foreground">
              {parentLocation ? (
                <Link
                  href={`/locations/${parentLocation.id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {parentLocation.code} ({parentLocation.name})
                </Link>
              ) : (
                <span className="text-muted-foreground italic text-xs">
                  Top Level
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              QR Identifier Payload
            </dt>
            <dd className="mt-1 font-mono text-xs text-muted-foreground">
              ANANYA:V1:LOCATION:{location.id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Created Date
            </dt>
            <dd className="mt-1 text-foreground">
              {new Date(location.createdAt).toLocaleString()}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Updated Date
            </dt>
            <dd className="mt-1 text-foreground">
              {new Date(location.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>

        {/* Child Locations Listing if any */}
        {childLocations.length > 0 && (
          <div className="pt-4 border-t border-border space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Child Locations ({childLocations.length})
            </h4>
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {childLocations.map((child) => (
                <div
                  key={child.id}
                  className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded font-medium">
                      {child.code}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {child.name}
                    </span>
                    <span className="text-[10px] capitalize px-2 py-0.5 bg-muted/60 text-muted-foreground rounded">
                      {child.kind}
                    </span>
                  </div>
                  <Link href={`/locations/${child.id}`}>
                    <Button variant="ghost" size="xs">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
