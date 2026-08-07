"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  Edit3,
  Trash2,
  Package,
  CheckCircle2,
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
import { ComponentForm } from "@/components/components/component-form";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

export default function ComponentsPage() {
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [locations, setLocations] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingComponent, setEditingComponent] =
    React.useState<ComponentDto | null>(null);
  const [deletingComponent, setDeletingComponent] =
    React.useState<ComponentDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [comps, locs] = await Promise.all([
        componentsApi.getAll(),
        locationsApi.getAll().catch(() => []),
      ]);
      setComponents(comps);
      setLocations(locs);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch components from API");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const locationMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of locations) {
      map.set(loc.id, loc.code);
    }
    return map;
  }, [locations]);

  const activeCount = React.useMemo(
    () => components.filter((c) => c.isActive).length,
    [components],
  );
  const uniqueUnitsCount = React.useMemo(
    () => new Set(components.map((c) => c.unit.toLowerCase())).size,
    [components],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingComponent) return;
    setDeleteLoading(true);
    setApiAlert(null);
    try {
      await componentsApi.delete(deletingComponent.id);
      setComponents((prev) =>
        prev.filter((c) => c.id !== deletingComponent.id),
      );
      setToastMessage(
        `Component "${deletingComponent.sku}" deleted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
      setDeletingComponent(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete component");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<ComponentDto>[]>(
    () => [
      {
        accessorKey: "sku",
        header: "SKU / Part No.",
        cell: ({ row }) => (
          <Link
            href={`/components/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            {row.original.sku}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Component Name",
        cell: ({ row }) => (
          <Link
            href={`/components/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground truncate max-w-xs block">
            {row.original.description || "—"}
          </span>
        ),
      },
      {
        accessorKey: "unit",
        header: "Unit",
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase px-2 py-0.5 border border-border rounded bg-card text-foreground">
            {row.original.unit}
          </span>
        ),
      },
      {
        accessorKey: "defaultLocationId",
        header: "Default Storage",
        cell: ({ row }) => {
          const locId = row.original.defaultLocationId;
          if (!locId)
            return (
              <span className="text-xs text-muted-foreground italic">—</span>
            );
          const locCode = locationMap.get(locId);
          return locCode ? (
            <Link
              href={`/locations/${locId}`}
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              {locCode}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Assigned</span>
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
            <Link href={`/components/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Edit component"
              onClick={() => {
                setEditingComponent(row.original);
                setIsFormOpen(true);
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete component"
              onClick={() => {
                setApiAlert(null);
                setDeletingComponent(row.original);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [locationMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "isActive",
      title: "Status",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  const handleFormSuccess = (savedComponent: ComponentDto) => {
    if (editingComponent) {
      setComponents((prev) =>
        prev.map((c) => (c.id === savedComponent.id ? savedComponent : c)),
      );
      setToastMessage(
        `Component "${savedComponent.sku}" updated successfully.`,
      );
    } else {
      setComponents((prev) => [savedComponent, ...prev]);
      setToastMessage(
        `Component "${savedComponent.sku}" created successfully.`,
      );
    }
    setIsFormOpen(false);
    setEditingComponent(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Components Management"
        description="Catalog of electronic parts, raw materials, hardware, and assemblies."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingComponent(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Component
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Components"
          value={components.length}
          subtitle="Master catalog items"
          icon={Package}
        />
        <StatCard
          title="Active Components"
          value={activeCount}
          subtitle="Currently active in ERP"
          icon={Package}
        />
        <StatCard
          title="Unit Diversity"
          value={uniqueUnitsCount}
          subtitle="Distinct units of measure"
          icon={Package}
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
          <Button variant="ghost" size="xs" onClick={fetchData}>
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
          if (!open) setEditingComponent(null);
        }}
        title={editingComponent ? "Edit Component" : "Create New Component"}
        description={
          editingComponent
            ? "Update internal component specifications, unit of measure, or default location."
            : "Register a new raw material, component part number, or assembly item."
        }
        size="md"
      >
        <ComponentForm
          initialData={editingComponent}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingComponent(null);
          }}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingComponent)}
        title="Delete Component"
        description={`Are you sure you want to delete component "${deletingComponent?.sku}" (${deletingComponent?.name})?`}
        confirmText="Delete Component"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingComponent(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        entityType="Component"
        columns={columns}
        data={components}
        searchKey="name"
        searchPlaceholder="Search components by name..."
        filters={filterConfigs}
        loading={loading}
        onRefreshData={fetchData}
        emptyTitle="No components found"
        emptyMessage="Get started by adding your first inventory component."
      />
    </div>
  );
}
