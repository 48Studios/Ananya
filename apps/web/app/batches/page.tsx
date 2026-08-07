"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, Plus, CheckCircle2, AlertCircle, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { BatchForm } from "@/components/batches/batch-form";
import { batchesApi, type BatchDto } from "@/lib/api/batches-api";
import { formatDate } from "@/lib/utils";

export default function BatchesPage() {
  const [batches, setBatches] = React.useState<BatchDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingBatch, setEditingBatch] = React.useState<BatchDto | null>(null);
  const [deletingBatch, setDeletingBatch] = React.useState<BatchDto | null>(null);
  const [banner, setBanner] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchBatches = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await batchesApi.getAll();
      setBatches(data || []);
    } catch (err: unknown) {
      setBanner({
        message: err instanceof Error ? err.message : "Failed to load batches",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const showBanner = (message: string, type: "success" | "error" = "success") => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingBatch(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (batch: BatchDto) => {
    setEditingBatch(batch);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner(editingBatch ? "Lot batch updated." : "Lot batch created.");
    fetchBatches();
  };

  const handleDelete = async () => {
    if (!deletingBatch) return;
    try {
      await batchesApi.delete(deletingBatch.id);
      showBanner(`Batch "${deletingBatch.batchNumber}" deleted.`);
      fetchBatches();
    } catch (err: unknown) {
      showBanner(err instanceof Error ? err.message : "Failed to delete batch.", "error");
    } finally {
      setDeletingBatch(null);
    }
  };

  const activeBatchesCount = React.useMemo(
    () => batches.filter((b) => b.status === "ACTIVE").length,
    [batches],
  );

  const expiringCount = React.useMemo(() => {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400 * 1000).toISOString().split("T")[0]!;
    return batches.filter((b) => b.expiryDate <= thirtyDaysFromNow && b.status === "ACTIVE").length;
  }, [batches]);

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Batch Status",
      options: [
        { label: "Active", value: "ACTIVE" },
        { label: "Quarantined", value: "QUARANTINED" },
        { label: "Expired", value: "EXPIRED" },
      ],
    },
  ];

  const columns: ColumnDef<BatchDto>[] = [
    {
      accessorKey: "batchNumber",
      header: "Batch / Lot No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.batchNumber}
        </span>
      ),
    },
    {
      accessorKey: "sku",
      header: "SKU / Material",
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">
            {row.original.sku}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.componentName}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "quantityOnHand",
      header: "On-Hand Stock",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-semibold">
          {row.original.quantityOnHand} units
        </span>
      ),
    },
    {
      accessorKey: "manufactureDate",
      header: "Mfg Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.manufactureDate)}
        </span>
      ),
    },
    {
      accessorKey: "expiryDate",
      header: "Expiry Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.expiryDate)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "ACTIVE") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Active
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle className="w-3 h-3 mr-1" /> {s}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => handleOpenEdit(row.original)}
            title="Edit batch"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDeletingBatch(row.original)}
            title="Delete batch"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`p-3 text-xs border rounded-md ${
            banner.type === "error"
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {banner.message}
        </div>
      )}

      <PageHeader
        title="Batch & Lot Management"
        description="Track material batches, lot expiry dates, quarantine holds, and batch genealogy."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Lot Batch
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Registered Batches"
          value={batches.length}
          icon={Boxes}
        />
        <StatCard
          title="Active Lot Stock"
          value={activeBatchesCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Expiring Soon (<30 Days)"
          value={`${expiringCount} Batches`}
          icon={AlertCircle}
        />
      </div>

      <EntityDataTable
        data={batches}
        columns={columns}
        searchPlaceholder="Search batches by number, SKU, or material..."
        loading={loading}
        emptyTitle="No Lot Batches Found"
        emptyMessage="Click 'Create Lot Batch' to record your first material batch."
        filterConfigs={filterConfigs}
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingBatch ? "Edit Lot Batch" : "Create Lot Batch"}
        description={
          editingBatch
            ? "Update material batch details, expiry dates, and lot status."
            : "Register a new material batch, lot manufacture dates, and quarantine holds."
        }
        size="sm"
      >
        <BatchForm
          initialData={editingBatch}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      <ConfirmDialog
        isOpen={Boolean(deletingBatch)}
        onCancel={() => setDeletingBatch(null)}
        title="Delete Lot Batch"
        description={`Are you sure you want to delete batch "${deletingBatch?.batchNumber}"?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
