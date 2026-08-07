"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  Send,
  MapPin,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { WarehouseTransferForm } from "@/components/warehouse-transfers/warehouse-transfer-form";
import {
  warehouseTransfersApi,
  type WarehouseTransferDto,
  type WarehouseTransferStatus,
} from "@/lib/api/warehouse-transfers-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getStatusBadge(status: WarehouseTransferStatus) {
  switch (status) {
    case "RECEIVED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Received
        </span>
      );
    case "DISPATCHED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <Truck className="w-3 h-3 mr-1" />
          In Transit
        </span>
      );
    case "SUBMITTED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Send className="w-3 h-3 mr-1" />
          Submitted
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Draft
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </span>
      );
  }
}

export default function WarehouseTransfersPage() {
  const [transfers, setTransfers] = React.useState<WarehouseTransferDto[]>([]);
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [locationsList, setLocationsList] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingTransfer, setEditingTransfer] =
    React.useState<WarehouseTransferDto | null>(null);
  const [deletingTransfer, setDeletingTransfer] =
    React.useState<WarehouseTransferDto | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchTransfers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [transfersData, locs] = await Promise.all([
        warehouseTransfersApi.getAll(),
        locationsApi.getAll().catch(() => []),
      ]);
      setTransfers(transfersData);
      setLocationsList(locs);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Warehouse Transfers list");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const submittedCount = React.useMemo(
    () => transfers.filter((t) => t.status === "SUBMITTED").length,
    [transfers],
  );
  const inTransitCount = React.useMemo(
    () => transfers.filter((t) => t.status === "DISPATCHED").length,
    [transfers],
  );
  const receivedCount = React.useMemo(
    () => transfers.filter((t) => t.status === "RECEIVED").length,
    [transfers],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingTransfer) return;
    try {
      await warehouseTransfersApi.delete(deletingTransfer.id);
      setToastMessage(`Transfer "${deletingTransfer.transferNumber}" deleted.`);
      setDeletingTransfer(null);
      setTimeout(() => setToastMessage(null), 4000);
      fetchTransfers();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete transfer",
      );
    }
  };

  const columns = React.useMemo<ColumnDef<WarehouseTransferDto>[]>(
    () => [
      {
        accessorKey: "transferNumber",
        header: "Transfer #",
        cell: ({ row }) => (
          <Link
            href={`/warehouse-transfers/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold"
          >
            {row.original.transferNumber}
          </Link>
        ),
      },
      {
        accessorKey: "sourceLocationId",
        header: "Source Location",
        cell: ({ row }) => {
          const loc = locationsMap[row.original.sourceLocationId];
          return (
            <span className="text-xs font-medium text-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3 text-muted-foreground" />
              {loc ? loc.name : row.original.sourceLocationId.slice(0, 8)}{" "}
              {loc && (
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({loc.code})
                </span>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "destinationLocationId",
        header: "Destination Location",
        cell: ({ row }) => {
          const loc = locationsMap[row.original.destinationLocationId];
          return (
            <span className="text-xs font-medium text-foreground flex items-center gap-1">
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              {loc
                ? loc.name
                : row.original.destinationLocationId.slice(0, 8)}{" "}
              {loc && (
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({loc.code})
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: "lineCount",
        header: "Line Items",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground font-bold">
            {row.original.lines.length} items
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        accessorKey: "createdAt",
        header: "Date Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/warehouse-transfers/${row.original.id}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                title="View transfer details"
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            {row.original.status === "DRAFT" && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Edit draft"
                  onClick={() => {
                    setEditingTransfer(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete draft"
                  onClick={() => setDeletingTransfer(row.original)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [locationsMap],
  );

  const filterConfigs: FilterConfig[] = React.useMemo(
    () => [
      {
        columnId: "status",
        title: "Status",
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Submitted", value: "SUBMITTED" },
          { label: "Dispatched (In Transit)", value: "DISPATCHED" },
          { label: "Received & Completed", value: "RECEIVED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      {
        columnId: "sourceLocationId",
        title: "Source Location",
        options: locationsList.map((loc) => ({
          label: `${loc.code} — ${loc.name}`,
          value: loc.id,
        })),
      },
      {
        columnId: "destinationLocationId",
        title: "Destination Location",
        options: locationsList.map((loc) => ({
          label: `${loc.code} — ${loc.name}`,
          value: loc.id,
        })),
      },
    ],
    [locationsList],
  );

  const handleFormSuccess = (savedTransfer: WarehouseTransferDto) => {
    setToastMessage(
      `Warehouse Transfer "${savedTransfer.transferNumber}" saved.`,
    );
    setIsFormOpen(false);
    setEditingTransfer(null);
    setTimeout(() => setToastMessage(null), 4000);
    fetchTransfers();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Warehouse Transfers"
        description="Inter-facility stock movement, dispatch tracking, and inventory transfer logs."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingTransfer(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Transfer
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Transfers"
          value={transfers.length}
          subtitle="Stock transfer requests"
          icon={Truck}
        />
        <StatCard
          title="Pending Dispatch"
          value={submittedCount}
          subtitle="Awaiting shipment"
          icon={Send}
        />
        <StatCard
          title="In Transit"
          value={inTransitCount}
          subtitle="Dispatched stock"
          icon={Truck}
        />
        <StatCard
          title="Received & Completed"
          value={receivedCount}
          subtitle="Verified at destination"
          icon={CheckCircle2}
        />
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchTransfers}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Creation / Edit Modal Form */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingTransfer(null);
          }
        }}
        title={
          editingTransfer ? "Edit Draft Transfer" : "Create Warehouse Transfer"
        }
        description={
          editingTransfer
            ? `Update draft transfer "${editingTransfer.transferNumber}" before dispatching stock between facilities.`
            : "Create a warehouse transfer with source and destination locations, requested date, and line items."
        }
        size="sm"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <WarehouseTransferForm
            initialData={editingTransfer}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingTransfer(null);
            }}
          />
        </div>
      </DialogShell>

      {/* Confirmation Dialog for Deleting */}
      <ConfirmDialog
        isOpen={Boolean(deletingTransfer)}
        title="Delete Draft Transfer"
        description={`Are you sure you want to delete draft Transfer "${deletingTransfer?.transferNumber}"?`}
        confirmText="Delete Transfer"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingTransfer(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={transfers}
        searchKey="transferNumber"
        searchPlaceholder="Search by Transfer # or notes..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Warehouse Transfers found"
        emptyMessage="Get started by creating your first inter-location inventory transfer."
      />
    </div>
  );
}
