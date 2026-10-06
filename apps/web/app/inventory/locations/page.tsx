"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  Edit3,
  Trash2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LocationForm } from "@/components/locations/location-form";
import { PrintLabelDialog } from "@/components/barcodes/print-label-dialog";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

const kindBadgeColors: Record<string, string> = {
  warehouse:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  room_area: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  // Legacy read-compatibility alias (persisted rows may still carry `room`).
  room: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  aisle:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  rack: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  shelf:
    "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  cabinet:
    "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  dry_cabinet:
    "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  bin: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  drawer: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20",
  compartment:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  reel_rack:
    "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  reel_slot:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  matrix_tray:
    "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  ic_tube_rail:
    "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20",
};

const kindLabels: Record<string, string> = {
  warehouse: "Warehouse",
  room_area: "Room / Area",
  aisle: "Aisle",
  rack: "Rack",
  shelf: "Shelf",
  cabinet: "Cabinet",
  dry_cabinet: "Dry Cabinet (MSD)",
  bin: "Bin",
  drawer: "Drawer",
  compartment: "Compartment",
  reel_rack: "Reel Rack",
  reel_slot: "Reel Slot",
  matrix_tray: "Matrix Tray",
  ic_tube_rail: "IC Tube / Rail",
  // Legacy read-compatibility aliases for existing persisted rows.
  room: "Room / Area",
  tray: "Matrix Tray",
  tube: "IC Tube / Rail",
};

export default function LocationsPage() {
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingLocation, setEditingLocation] =
    React.useState<LocationDto | null>(null);
  const [deletingLocation, setDeletingLocation] =
    React.useState<LocationDto | null>(null);
  const [printingLocation, setPrintingLocation] =
    React.useState<LocationDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);
  const fetchLocations = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await locationsApi.getAll();
      setLocations(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch locations from API");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Lookup map for parent codes
  const parentMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.code);
    }
    return map;
  }, [locations]);

  const activeCount = React.useMemo(
    () => locations.filter((l) => l.isActive).length,
    [locations],
  );
  const facilityCount = React.useMemo(
    () =>
      locations.filter(
        (l) =>
          ["warehouse", "room_area", "room", "aisle"].includes(
            l.kind.toLowerCase(),
          ) || !l.parentId,
      ).length,
    [locations],
  );
  const microLocationCount = React.useMemo(
    () =>
      locations.filter((l) =>
        [
          "bin",
          "drawer",
          "compartment",
          "reel_slot",
          "reel_rack",
          "matrix_tray",
          "ic_tube_rail",
          // Legacy read-compatibility aliases so existing rows are still counted.
          "tray",
          "tube",
        ].includes(l.kind.toLowerCase()),
      ).length,
    [locations],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingLocation) return;
    setDeleteLoading(true);
    setApiAlert(null);
    try {
      await locationsApi.delete(deletingLocation.id);
      setLocations((prev) => prev.filter((l) => l.id !== deletingLocation.id));
      setToastMessage(
        `Location "${deletingLocation.code}" deleted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete location");
      }
    } finally {
      setDeletingLocation(null);
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<LocationDto>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Location Code",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[130px]">
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={`/inventory/locations/${row.original.id}`}
                      className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold inline-block truncate max-w-full align-middle"
                    />
                  }
                >
                  {row.original.code}
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-xs">
                  {row.original.code}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/inventory/locations/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "kind",
        header: "Kind",
        cell: ({ row }) => {
          const kind = row.original.kind.toLowerCase();
          const badgeClass =
            kindBadgeColors[kind] ||
            "bg-muted text-muted-foreground border-border";
          const label = kindLabels[kind] || kind;
          return (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full ${badgeClass}`}
            >
              {label}
            </span>
          );
        },
      },
      {
        accessorKey: "parentId",
        header: "Parent Location",
        cell: ({ row }) => {
          const parentId = row.original.parentId;
          if (!parentId) {
            return (
              <span className="text-muted-foreground text-xs italic">
                Top Level
              </span>
            );
          }
          const parentCode = parentMap.get(parentId);
          return parentCode ? (
            <Link
              href={`/inventory/locations/${parentId}`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {parentCode}
            </Link>
          ) : (
            <span className="text-muted-foreground text-xs">{parentId}</span>
          );
        },
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => <RecordStatusBadge isActive={row.original.isActive} />,
      },
      {
        id: "actions",
        header: () => <span className="text-right block w-full">Actions</span>,
        meta: {
          width: "8%",
          headerClassName: "text-right",
          cellClassName: "text-right",
        },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Print location tag"
              aria-label="Print location tag"
              onClick={() => setPrintingLocation(row.original)}
            >
              <Printer className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Link href={`/inventory/locations/${row.original.id}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                title="View details"
                aria-label="View details"
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit location"
              aria-label="Edit location"
              onClick={() => {
                setEditingLocation(row.original);
                setIsFormOpen(true);
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete location"
              aria-label="Delete location"
              onClick={() => {
                setApiAlert(null);
                setDeletingLocation(row.original);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [parentMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "kind",
      title: "Kind",
      options: [
        { label: "Warehouse", value: "warehouse" },
        { label: "Room / Area", value: "room_area" },
        { label: "Aisle", value: "aisle" },
        { label: "Rack", value: "rack" },
        { label: "Shelf", value: "shelf" },
        { label: "Cabinet", value: "cabinet" },
        { label: "Dry Cabinet (MSD)", value: "dry_cabinet" },
        { label: "Bin", value: "bin" },
        { label: "Drawer", value: "drawer" },
        { label: "Compartment", value: "compartment" },
        { label: "Reel Rack", value: "reel_rack" },
        { label: "Reel Slot", value: "reel_slot" },
        { label: "Matrix Tray", value: "matrix_tray" },
        { label: "IC Tube / Rail", value: "ic_tube_rail" },
        // Legacy read-compatibility aliases so existing rows remain filterable.
        { label: "Room / Area (legacy)", value: "room" },
        { label: "Matrix Tray (legacy)", value: "tray" },
        { label: "IC Tube / Rail (legacy)", value: "tube" },
      ],
    },
    {
      columnId: "isActive",
      title: "Status",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  const handleFormSuccess = (savedLocation: LocationDto) => {
    if (editingLocation) {
      setLocations((prev) =>
        prev.map((l) => (l.id === savedLocation.id ? savedLocation : l)),
      );
      setToastMessage(`Location "${savedLocation.code}" updated successfully.`);
    } else {
      setLocations((prev) => [savedLocation, ...prev]);
      setToastMessage(`Location "${savedLocation.code}" created successfully.`);
    }
    setIsFormOpen(false);
    setEditingLocation(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Storage Locations & Bins"
        description="Manage facilities, aisles, racks, shelves, bins, SMD reel slots, and storage compartments."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingLocation(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Location / Bin
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Storage Nodes"
          value={locations.length}
          subtitle="All storage facilities & bins"
          icon={Package}
        />
        <StatCard
          title="Active Locations"
          value={activeCount}
          subtitle="Operational"
          icon={CheckCircle2}
        />
        <StatCard
          title="Facilities & Zones"
          value={facilityCount}
          subtitle="Warehouses, rooms & aisles"
          icon={MapPin}
        />
        <StatCard
          title="Bins & Micro-Locations"
          value={microLocationCount}
          subtitle="Bins, drawers, reels & trays"
          icon={Layers}
        />
      </div>
      {/* Modal / Slide-over for Creating or Editing Location */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingLocation(null);
          }
        }}
        title={editingLocation ? "Edit Location" : "Create New Location"}
        description={
          editingLocation
            ? `Update the storage location "${editingLocation.code}".`
            : "Create a new storage location."
        }
        size="sm"
      >
        <LocationForm
          initialData={editingLocation}
          locations={locations}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingLocation(null);
          }}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingLocation)}
        title="Delete Location"
        description={`Are you sure you want to delete location "${deletingLocation?.code}" (${deletingLocation?.name})?`}
        confirmText="Delete Location"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingLocation(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        notice={
          <>
            {toastMessage && (
              <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{toastMessage}</span>
              </div>
            )}

            {apiAlert && (
              <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{apiAlert}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
                <Button variant="ghost" size="xs" onClick={fetchLocations}>
                  Retry
                </Button>
              </div>
            )}
          </>
        }
        columns={columns}
        data={locations}
        entityType="Location"
        searchKey="code"
        searchPlaceholder="Search locations & bins by code..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No storage locations or bins found"
        emptyMessage="Get started by creating your first storage location or bin."
      />

      {/* Print Location Tag Modal */}
      {printingLocation && (
        <PrintLabelDialog
          isOpen={!!printingLocation}
          onClose={() => setPrintingLocation(null)}
          entityType="LOCATION"
          entityId={printingLocation.id}
          defaultTemplate="SHELF_BIN"
          title={`Print Location Tag: ${printingLocation.code}`}
        />
      )}
    </div>
  );
}
