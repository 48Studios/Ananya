"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  Edit3,
  Trash2,
  Factory,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
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
import { ManufacturerForm } from "@/components/manufacturers/manufacturer-form";
import {
  manufacturersApi,
  type ManufacturerDto,
} from "@/lib/api/manufacturers-api";

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = React.useState<ManufacturerDto[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingManufacturer, setEditingManufacturer] =
    React.useState<ManufacturerDto | null>(null);
  const [deletingManufacturer, setDeletingManufacturer] =
    React.useState<ManufacturerDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);
  const fetchManufacturers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manufacturersApi.getAll();
      setManufacturers(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch manufacturers from API");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchManufacturers();
  }, [fetchManufacturers]);

  const activeCount = React.useMemo(
    () => manufacturers.filter((m) => m.isActive).length,
    [manufacturers],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingManufacturer) return;
    setDeleteLoading(true);
    setApiAlert(null);
    try {
      await manufacturersApi.delete(deletingManufacturer.id);
      setManufacturers((prev) =>
        prev.filter((m) => m.id !== deletingManufacturer.id),
      );
      setToastMessage(
        `Manufacturer "${deletingManufacturer.code}" deleted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete manufacturer");
      }
    } finally {
      setDeletingManufacturer(null);
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<ManufacturerDto>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[130px]">
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={`/manufacturers/${row.original.id}`}
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
        header: "Manufacturer Name",
        cell: ({ row }) => (
          <Link
            href={`/manufacturers/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => <RecordStatusBadge isActive={row.original.isActive} />,
      },
      {
        accessorKey: "createdAt",
        header: "Created At",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
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
            <Link href={`/manufacturers/${row.original.id}`}>
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
              title="Edit manufacturer"
              aria-label="Edit manufacturer"
              onClick={() => {
                setEditingManufacturer(row.original);
                setIsFormOpen(true);
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete manufacturer"
              aria-label="Delete manufacturer"
              onClick={() => {
                setApiAlert(null);
                setDeletingManufacturer(row.original);
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
      columnId: "isActive",
      title: "Status",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  const handleFormSuccess = (savedManufacturer: ManufacturerDto) => {
    if (editingManufacturer) {
      setManufacturers((prev) =>
        prev.map((m) =>
          m.id === savedManufacturer.id ? savedManufacturer : m,
        ),
      );
      setToastMessage(
        `Manufacturer "${savedManufacturer.code}" updated successfully.`,
      );
    } else {
      setManufacturers((prev) => [savedManufacturer, ...prev]);
      setToastMessage(
        `Manufacturer "${savedManufacturer.code}" created successfully.`,
      );
    }
    setIsFormOpen(false);
    setEditingManufacturer(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Manufacturers Management"
        description="Master vendor and producer records referenced by inventory components."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingManufacturer(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Manufacturer
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Total Manufacturers"
          value={manufacturers.length}
          subtitle="Registered producer entities"
          icon={Factory}
        />
        <StatCard
          title="Active Manufacturers"
          value={activeCount}
          subtitle="Active supplier master records"
          icon={Factory}
        />
      </div>
      {/* Form Modal */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingManufacturer(null);
          }
        }}
        title={
          editingManufacturer ? "Edit Manufacturer" : "Create New Manufacturer"
        }
        description={
          editingManufacturer
            ? `Update the manufacturer record "${editingManufacturer.code}" used across sourced components.`
            : "Create a manufacturer master record for component sourcing and catalog references."
        }
        size="sm"
      >
        <ManufacturerForm
          initialData={editingManufacturer}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingManufacturer(null);
          }}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingManufacturer)}
        title="Delete Manufacturer"
        description={`Are you sure you want to delete manufacturer "${deletingManufacturer?.code}" (${deletingManufacturer?.name})?`}
        confirmText="Delete Manufacturer"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingManufacturer(null)}
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
                <Button variant="ghost" size="xs" onClick={fetchManufacturers}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Retry
                </Button>
              </div>
            )}
          </>
        }
        columns={columns}
        data={manufacturers}
        entityType="Manufacturer"
        searchKey="name"
        searchPlaceholder="Search manufacturers by name..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No manufacturers found"
        emptyMessage="Get started by creating your first manufacturer record."
      />
    </div>
  );
}
