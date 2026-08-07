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

const kindBadgeColors: Record<string, string> = {
  warehouse:
    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  aisle:
    "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  rack: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  shelf:
    "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  bin: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
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
  const topLevelCount = React.useMemo(
    () => locations.filter((l) => !l.parentId).length,
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
      setDeletingLocation(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete location");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<LocationDto>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Location Code",
        cell: ({ row }) => (
          <Link
            href={`/locations/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            href={`/locations/${row.original.id}`}
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
          return (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border rounded-full capitalize ${badgeClass}`}
            >
              {kind}
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
              href={`/locations/${parentId}`}
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
            <Link href={`/locations/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
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
    [parentMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "kind",
      title: "Kind",
      options: [
        { label: "Warehouse", value: "warehouse" },
        { label: "Aisle", value: "aisle" },
        { label: "Rack", value: "rack" },
        { label: "Shelf", value: "shelf" },
        { label: "Bin", value: "bin" },
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
        title="Locations Management"
        description="Manage storage hierarchy, warehouses, aisles, racks, shelves, and bins."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingLocation(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Location
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Locations"
          value={locations.length}
          subtitle="All storage facilities"
          icon={MapPin}
        />
        <StatCard
          title="Active Locations"
          value={activeCount}
          subtitle="Currently operational"
          icon={MapPin}
        />
        <StatCard
          title="Top Level Warehouses"
          value={topLevelCount}
          subtitle="Root storage entities"
          icon={MapPin}
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
        title={editingLocation ? "Edit Location" : "Create New Location"}
        description={
          editingLocation
            ? "Update storage node code, kind, or parent location node."
            : "Configure warehouses, zones, aisles, and storage location nodes."
        }
        size="md"
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
        entityType="Location"
        columns={columns}
        data={locations}
        searchKey="code"
        searchPlaceholder="Search locations by code..."
        filters={filterConfigs}
        loading={loading}
        onRefreshData={fetchLocations}
        emptyTitle="No locations found"
        emptyMessage="Get started by creating your first storage location."
      />
    </div>
  );
}
