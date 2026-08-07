"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Warehouse as WarehouseIcon,
  Plus,
  CheckCircle2,
  Boxes,
  Edit3,
  Trash2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { LocationForm } from "@/components/locations/location-form";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

export default function WarehousePage() {
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingLocation, setEditingLocation] =
    React.useState<LocationDto | null>(null);
  const [deletingLocation, setDeletingLocation] =
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
        setError("Failed to fetch warehouse locations from API");
      }
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

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
      setDeletingLocation(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete warehouse location");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

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

  const columns = React.useMemo<ColumnDef<LocationDto>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Warehouse / Location Code",
        cell: ({ row }) => (
          <Link
            href={`/locations/${row.original.id}`}
            className="font-mono text-xs font-bold text-primary hover:underline"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Location Name",
        cell: ({ row }) => (
          <span className="font-medium text-foreground">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "kind",
        header: "Storage Type",
        cell: ({ row }) => (
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border capitalize">
            {row.original.kind || "warehouse"}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
              row.original.isActive
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit location"
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
    [],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "kind",
      title: "Storage Type",
      options: [
        { label: "Warehouse", value: "warehouse" },
        { label: "Aisle", value: "aisle" },
        { label: "Rack", value: "rack" },
        { label: "Shelf", value: "shelf" },
        { label: "Bin", value: "bin" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouse Operations Control Center"
        description="Manage multi-facility storage locations, aisle/rack/bin allocations, and stock movement policies."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingLocation(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Warehouse Location
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Warehouse Locations"
          value={locations.length}
          icon={WarehouseIcon}
        />
        <StatCard
          title="Storage Bins Configured"
          value={`${locations.filter((l) => l.kind === "bin").length} Bins`}
          icon={Boxes}
        />
        <StatCard
          title="Operational Status"
          value="Online"
          icon={CheckCircle2}
        />
      </div>

      {/* Notifications */}
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
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Form Modal */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingLocation(null);
        }}
        title={
          editingLocation
            ? "Edit Warehouse Location"
            : "Create Warehouse Location"
        }
        description={
          editingLocation
            ? "Update warehouse facility code, name, or storage hierarchy parent."
            : "Configure warehouse facilities, storage areas, and putaway zones."
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

      <EntityDataTable
        data={locations}
        columns={columns}
        entityType="Location"
        searchKey="code"
        searchPlaceholder="Search warehouses by code, name, or location..."
        filters={filterConfigs}
        loading={loading}
        onRefreshData={fetchLocations}
        emptyTitle="No warehouse locations found"
        emptyMessage="Get started by creating your first storage facility location."
      />
    </div>
  );
}
