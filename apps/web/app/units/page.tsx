"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Scale,
  Plus,
  CheckCircle2,
  Edit3,
  Trash2,
  AlertCircle,
  RefreshCw,
  Ruler,
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
import { UnitForm } from "@/components/units/unit-form";
import { unitsApi, type UnitDto } from "@/lib/api/units-api";

export default function UnitsPage() {
  const [units, setUnits] = React.useState<UnitDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingUnit, setEditingUnit] = React.useState<UnitDto | null>(null);
  const [deletingUnit, setDeletingUnit] = React.useState<UnitDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);

  const fetchUnits = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await unitsApi.getAll();
      setUnits(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch units of measure from API");
      }
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const baseUnitCount = React.useMemo(
    () => units.filter((u) => u.isBaseUnit).length,
    [units],
  );
  const derivedUnitCount = React.useMemo(
    () => units.filter((u) => !u.isBaseUnit).length,
    [units],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingUnit) return;
    setDeleteLoading(true);
    setApiAlert(null);
    try {
      await unitsApi.delete(deletingUnit.id);
      setUnits((prev) => prev.filter((u) => u.id !== deletingUnit.id));
      setToastMessage(`Unit "${deletingUnit.name}" deleted successfully.`);
      setTimeout(() => setToastMessage(null), 4000);
      setDeletingUnit(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete unit of measure");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFormSuccess = (savedUnit: UnitDto) => {
    if (editingUnit) {
      setUnits((prev) =>
        prev.map((u) => (u.id === savedUnit.id ? savedUnit : u)),
      );
      setToastMessage(`Unit "${savedUnit.name}" updated successfully.`);
    } else {
      setUnits((prev) => [savedUnit, ...prev]);
      setToastMessage(`Unit "${savedUnit.name}" created successfully.`);
    }
    setIsFormOpen(false);
    setEditingUnit(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const columns = React.useMemo<ColumnDef<UnitDto>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Unit Symbol",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-primary">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "category",
        header: "Measurement Category",
        cell: ({ row }) => (
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
            {row.original.category}
          </span>
        ),
      },
      {
        accessorKey: "conversionFactor",
        header: "Conversion Factor",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground">
            {row.original.conversionFactor ?? "1.0000"}
          </span>
        ),
      },
      {
        accessorKey: "precision",
        header: "Precision",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.precision} decimals
          </span>
        ),
      },
      {
        accessorKey: "isBaseUnit",
        header: "Classification",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
              row.original.isBaseUnit
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-muted text-muted-foreground border border-border"
            }`}
          >
            {row.original.isBaseUnit ? "Primary Base Unit" : "Derived Secondary"}
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
              title="Edit unit"
              onClick={() => {
                setEditingUnit(row.original);
                setIsFormOpen(true);
              }}
            >
              <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete unit"
              onClick={() => {
                setApiAlert(null);
                setDeletingUnit(row.original);
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
      columnId: "category",
      title: "Category",
      options: [
        { label: "Count", value: "Count" },
        { label: "Weight", value: "Weight" },
        { label: "Length", value: "Length" },
        { label: "Volume", value: "Volume" },
        { label: "Time", value: "Time" },
        { label: "Area", value: "Area" },
        { label: "General", value: "General" },
      ],
    },
    {
      columnId: "isBaseUnit",
      title: "Classification",
      options: [
        { label: "Primary Base Unit", value: "true" },
        { label: "Derived Secondary", value: "false" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Units of Measure (UOM)"
        description="Configure unit conversion factors, inventory measurement standards, and baseline packaging units."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingUnit(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Unit of Measure
          </Button>
        }
      />

      {/* Neutral Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Configured Units"
          value={units.length}
          subtitle="Registered UOM standards"
          icon={Scale}
        />
        <StatCard
          title="Primary Base Units"
          value={baseUnitCount}
          subtitle="Baseline measurement standards"
          icon={CheckCircle2}
        />
        <StatCard
          title="Derived Secondary Units"
          value={derivedUnitCount}
          subtitle="Calculated conversion units"
          icon={Ruler}
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
          <Button variant="ghost" size="xs" onClick={fetchUnits}>
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
          if (!open) setEditingUnit(null);
        }}
        title={editingUnit ? "Edit Unit of Measure" : "Create Unit of Measure"}
        description={
          editingUnit
            ? "Update unit symbol, category, and decimal precision."
            : "Define standard units of measure, precision scales, and conversion rules."
        }
        size="sm"
      >
        <UnitForm
          initialData={editingUnit}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingUnit(null);
          }}
        />
      </DialogShell>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingUnit)}
        title="Delete Unit of Measure"
        description={`Are you sure you want to delete unit "${deletingUnit?.name}" (${deletingUnit?.category})?`}
        confirmText="Delete Unit"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingUnit(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        data={units}
        columns={columns}
        entityType="Unit"
        loading={loading}
        searchKey="name"
        searchPlaceholder="Search units by name or symbol..."
        filters={filterConfigs}
        onRefreshData={fetchUnits}
        emptyTitle="No units of measure found"
        emptyMessage="Get started by adding your first unit of measure standard."
      />
    </div>
  );
}
