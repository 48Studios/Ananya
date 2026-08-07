"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  Lock,
  Clock,
  XCircle,
  User,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
  Unlock,
  PackageCheck,
  FileText,
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
import { ReservationForm } from "@/components/reservations/reservation-form";
import {
  reservationsApi,
  type ReservationDto,
  type ReservationStatus,
  type ReservationType,
} from "@/lib/api/reservations-api";

function getStatusBadge(status: ReservationStatus) {
  switch (status) {
    case "FULFILLED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <PackageCheck className="w-3 h-3 mr-1" />
          Fulfilled
        </span>
      );
    case "RELEASED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">
          <Unlock className="w-3 h-3 mr-1" />
          Released
        </span>
      );
    case "ACTIVE":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Lock className="w-3 h-3 mr-1" />
          Active Hold
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Draft
        </span>
      );
    case "EXPIRED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Expired
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

function getTypeBadge(type: ReservationType) {
  switch (type) {
    case "WORK_ORDER":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-purple-500/10 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
          Work Order
        </span>
      );
    case "PROJECT":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
          Project Stock
        </span>
      );
    case "PURCHASE_REQUEST":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
          Purchase Req
        </span>
      );
    case "SALES_ORDER":
      return (
        <span className="font-mono text-xs font-bold text-foreground bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
          Sales Order
        </span>
      );
  }
}

export default function ReservationsPage() {
  const [reservations, setReservations] = React.useState<ReservationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingReservation, setEditingReservation] =
    React.useState<ReservationDto | null>(null);
  const [deletingReservation, setDeletingReservation] =
    React.useState<ReservationDto | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchReservations = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resData = await reservationsApi.getAll();
      setReservations(resData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Inventory Reservations list");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const activeCount = React.useMemo(
    () => reservations.filter((r) => r.status === "ACTIVE").length,
    [reservations],
  );
  const fulfilledCount = React.useMemo(
    () => reservations.filter((r) => r.status === "FULFILLED").length,
    [reservations],
  );
  const releasedCount = React.useMemo(
    () => reservations.filter((r) => r.status === "RELEASED").length,
    [reservations],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingReservation) return;
    try {
      await reservationsApi.delete(deletingReservation.id);
      setToastMessage(
        `Reservation "${deletingReservation.reservationNumber}" deleted.`,
      );
      setDeletingReservation(null);
      setTimeout(() => setToastMessage(null), 4000);
      fetchReservations();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete reservation",
      );
    }
  };

  const columns = React.useMemo<ColumnDef<ReservationDto>[]>(
    () => [
      {
        accessorKey: "reservationNumber",
        header: "Reservation #",
        cell: ({ row }) => (
          <Link
            href={`/reservations/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold"
          >
            {row.original.reservationNumber}
          </Link>
        ),
      },
      {
        accessorKey: "reservationType",
        header: "Type",
        cell: ({ row }) => getTypeBadge(row.original.reservationType),
      },
      {
        accessorKey: "referenceDocument",
        header: "Reference Doc",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground font-medium">
            {row.original.referenceDocument || "—"}
          </span>
        ),
      },
      {
        accessorKey: "reservedBy",
        header: "Reserved By",
        cell: ({ row }) => (
          <span className="text-xs text-foreground flex items-center gap-1">
            <User className="w-3 h-3 text-muted-foreground" />
            {row.original.reservedBy}
          </span>
        ),
      },
      {
        id: "lineCount",
        header: "Reserved Lines",
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
        accessorKey: "expiresAt",
        header: "Expiration Date",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {row.original.expiresAt
              ? new Date(row.original.expiresAt).toLocaleDateString()
              : "No expiry"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/reservations/${row.original.id}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                title="View reservation details"
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            {(row.original.status === "DRAFT" ||
              row.original.status === "ACTIVE") && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Edit reservation"
                  onClick={() => {
                    setEditingReservation(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete reservation"
                  onClick={() => setDeletingReservation(row.original)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const filterConfigs: FilterConfig[] = React.useMemo(
    () => [
      {
        columnId: "status",
        title: "Status",
        options: [
          { label: "Active Lock", value: "ACTIVE" },
          { label: "Fulfilled & Consumed", value: "FULFILLED" },
          { label: "Released", value: "RELEASED" },
          { label: "Draft", value: "DRAFT" },
          { label: "Expired", value: "EXPIRED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      {
        columnId: "reservationType",
        title: "Type",
        options: [
          { label: "Work Order", value: "WORK_ORDER" },
          { label: "Project Stock", value: "PROJECT" },
          { label: "Purchase Request", value: "PURCHASE_REQUEST" },
          { label: "Sales Order", value: "SALES_ORDER" },
        ],
      },
    ],
    [],
  );

  const handleFormSuccess = (saved: ReservationDto) => {
    setToastMessage(
      `Inventory Reservation "${saved.reservationNumber}" saved.`,
    );
    setIsFormOpen(false);
    setEditingReservation(null);
    setTimeout(() => setToastMessage(null), 4000);
    fetchReservations();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Inventory Reservations & Allocations"
        description="Commit inventory to future operations and manage stock holds without physical movement."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingReservation(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Reservation
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Reservations"
          value={reservations.length}
          subtitle="Inventory commitment logs"
          icon={FileText}
        />
        <StatCard
          title="Active Stock Holds"
          value={activeCount}
          subtitle="Reducing Available Qty"
          icon={Lock}
        />
        <StatCard
          title="Fulfilled & Consumed"
          value={fulfilledCount}
          subtitle="Inventory issued"
          icon={PackageCheck}
        />
        <StatCard
          title="Released to Available"
          value={releasedCount}
          subtitle="Stock holds unlocked"
          icon={Unlock}
        />
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <Lock className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchReservations}>
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
          if (!open) setEditingReservation(null);
        }}
        title={
          editingReservation
            ? "Edit Reservation Lock"
            : "Create Inventory Reservation"
        }
        description={
          editingReservation
            ? "Update hard-allocation reservation quantity or target order project."
            : "Lock stock quantities for active production orders, sales allocations, or client projects."
        }
        size="xl"
      >
        <ReservationForm
          initialData={editingReservation}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingReservation(null);
          }}
        />
      </DialogShell>

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingReservation)}
        title="Delete Inventory Reservation"
        description={`Are you sure you want to delete Reservation "${deletingReservation?.reservationNumber}"?`}
        confirmText="Delete Reservation"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingReservation(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={reservations}
        searchKey="reservationNumber"
        searchPlaceholder="Search by Reservation #, reference, reserved by, or notes..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Inventory Reservations found"
        emptyMessage="Get started by creating your first stock hold reservation for work orders or projects."
      />
    </div>
  );
}
