"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, Plus, CheckCircle2, Edit2, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { LocationForm } from "@/components/locations/location-form";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

export default function WarehouseBinsPage() {
  const [bins, setBins] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingBin, setEditingBin] = React.useState<LocationDto | null>(null);
  const [deletingBin, setDeletingBin] = React.useState<LocationDto | null>(null);
  const [banner, setBanner] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchBins = React.useCallback(async () => {
    setLoading(true);
    try {
      const allLocs = await locationsApi.getAll();
      const binLocs = (allLocs || []).filter((l) => l.kind === "BIN" || l.kind === "SHELF");
      setBins(binLocs);
    } catch (err: unknown) {
      setBanner({
        message: err instanceof Error ? err.message : "Failed to load storage bins",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBins();
  }, [fetchBins]);

  const showBanner = (message: string, type: "success" | "error" = "success") => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingBin(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (bin: LocationDto) => {
    setEditingBin(bin);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner(editingBin ? "Storage bin updated successfully." : "Storage bin created successfully.");
    fetchBins();
  };

  const handleDelete = async () => {
    if (!deletingBin) return;
    try {
      await locationsApi.delete(deletingBin.id);
      showBanner(`Storage bin "${deletingBin.code}" deleted successfully.`);
      fetchBins();
    } catch (err: unknown) {
      showBanner(err instanceof Error ? err.message : "Failed to delete storage bin.", "error");
    } finally {
      setDeletingBin(null);
    }
  };

  const activeBinsCount = React.useMemo(() => bins.filter((b) => b.isActive).length, [bins]);

  const columns: ColumnDef<LocationDto>[] = [
    {
      accessorKey: "code",
      header: "Storage Bin Path",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Facility & Zone Name",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "kind",
      header: "Location Kind",
      cell: ({ row }) => (
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.kind}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        row.original.isActive ? (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Active Bin
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
            Inactive
          </span>
        )
      ),
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
            title="Edit bin"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDeletingBin(row.original)}
            title="Delete bin"
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
        title="Warehouse Bins & Storage Locations"
        description="Configure aisle, rack, and shelf bin paths for high-density inventory putaway."
        actions={
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Bin Location
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Bins"
          value={bins.length}
          icon={Boxes}
        />
        <StatCard
          title="Available Active Bins"
          value={activeBinsCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Bin Utilization Ratio"
          value={bins.length > 0 ? `${Math.round((activeBinsCount / bins.length) * 100)}% Active` : "100% Active"}
          icon={Package}
        />
      </div>

      <EntityDataTable
        data={bins}
        columns={columns}
        searchPlaceholder="Search bin locations by code or name..."
        loading={loading}
        emptyTitle="No Storage Bins Found"
        emptyMessage="Click 'Create Bin Location' to add your first storage bin location."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingBin ? "Edit Storage Bin" : "Create Bin Location"}
        description={
          editingBin
            ? "Update aisle, rack, and shelf bin path configuration."
            : "Configure aisle, rack, and shelf bin paths for high-density inventory putaway."
        }
        size="md"
      >
        <LocationForm
          initialData={editingBin}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      <ConfirmDialog
        isOpen={Boolean(deletingBin)}
        onCancel={() => setDeletingBin(null)}
        title="Delete Storage Bin"
        description={`Are you sure you want to delete storage bin "${deletingBin?.code}"?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
