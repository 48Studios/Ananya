"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { QrCode, Plus, CheckCircle2, Clock, Tag, Edit2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { SerialForm } from "@/components/serials/serial-form";
import { serialsApi, type SerialDto } from "@/lib/api/serials-api";

export default function SerialsPage() {
  const [serials, setSerials] = React.useState<SerialDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingSerial, setEditingSerial] = React.useState<SerialDto | null>(null);
  const [deletingSerial, setDeletingSerial] = React.useState<SerialDto | null>(null);
  const [banner, setBanner] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchSerials = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await serialsApi.getAll();
      setSerials(data || []);
    } catch (err: unknown) {
      setBanner({
        message: err instanceof Error ? err.message : "Failed to load serial numbers",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSerials();
  }, [fetchSerials]);

  const showBanner = (message: string, type: "success" | "error" = "success") => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingSerial(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (ser: SerialDto) => {
    setEditingSerial(ser);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner(editingSerial ? "Serial record updated." : "Serial number registered.");
    fetchSerials();
  };

  const handleDelete = async () => {
    if (!deletingSerial) return;
    try {
      await serialsApi.delete(deletingSerial.id);
      showBanner(`Serial "${deletingSerial.serialNumber}" deleted.`);
      fetchSerials();
    } catch (err: unknown) {
      showBanner(err instanceof Error ? err.message : "Failed to delete serial.", "error");
    } finally {
      setDeletingSerial(null);
    }
  };

  const inStockCount = React.useMemo(
    () => serials.filter((s) => s.status === "IN_STOCK").length,
    [serials],
  );

  const assignedCount = React.useMemo(
    () => serials.filter((s) => s.status === "ASSIGNED").length,
    [serials],
  );

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Serial Lifecycle",
      options: [
        { label: "In Stock", value: "IN_STOCK" },
        { label: "Assigned", value: "ASSIGNED" },
        { label: "Dispatched", value: "DISPATCHED" },
        { label: "Maintenance", value: "MAINTENANCE" },
      ],
    },
  ];

  const columns: ColumnDef<SerialDto>[] = [
    {
      accessorKey: "serialNumber",
      header: "Serial Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.serialNumber}
        </span>
      ),
    },
    {
      accessorKey: "sku",
      header: "Item / Product SKU",
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
      accessorKey: "location",
      header: "Current Storage Path",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.location}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "IN_STOCK") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> In Stock
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> {s}
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
            title="Edit serial"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDeletingSerial(row.original)}
            title="Delete serial"
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
        title="Serial Number Master Index"
        description="Individual serial number tracking, barcode assignment, asset history, and component lifecycle."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Register Serial Number
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Serials Registered"
          value={serials.length}
          icon={QrCode}
        />
        <StatCard
          title="Available In Stock"
          value={inStockCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Assigned to Orders"
          value={assignedCount}
          icon={Tag}
        />
      </div>

      <EntityDataTable
        data={serials}
        columns={columns}
        searchPlaceholder="Search serials by number, SKU, product, or location..."
        loading={loading}
        emptyTitle="No Serial Numbers Registered"
        emptyMessage="Click 'Register Serial Number' to index your first serialized asset."
        filterConfigs={filterConfigs}
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingSerial ? "Edit Serial Record" : "Register Serial Number"}
        description={
          editingSerial
            ? "Update serial number assignment, storage path, or lifecycle status."
            : "Register individual serial numbers, component tracking, and storage location paths."
        }
        size="md"
      >
        <SerialForm
          initialData={editingSerial}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      <ConfirmDialog
        isOpen={Boolean(deletingSerial)}
        onCancel={() => setDeletingSerial(null)}
        title="Delete Serial Record"
        description={`Are you sure you want to delete serial "${deletingSerial?.serialNumber}"?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
