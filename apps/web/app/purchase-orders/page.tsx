"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  Edit3,
  Trash2,
  Send,
  Ban,
  ShoppingBag,
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PurchaseOrderForm } from "@/components/purchase-orders/po-form";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = React.useState<PurchaseOrderDto[]>([]);
  const [suppliersMap, setSuppliersMap] = React.useState<
    Record<string, SupplierDto>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingPo, setEditingPo] = React.useState<PurchaseOrderDto | null>(
    null,
  );
  const [deletingPo, setDeletingPo] = React.useState<PurchaseOrderDto | null>(
    null,
  );
  const [cancellingPo, setCancellingPo] =
    React.useState<PurchaseOrderDto | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [apiAlert, setApiAlert] = React.useState<string | null>(null);

  const fetchOrders = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pos, sups] = await Promise.all([
        purchaseOrdersApi.getAll(),
        suppliersApi.getAll().catch(() => []),
      ]);
      setOrders(pos);

      const supMap: Record<string, SupplierDto> = {};
      for (const s of sups) {
        supMap[s.id] = s;
      }
      setSuppliersMap(supMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch purchase orders");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const draftCount = React.useMemo(
    () => orders.filter((o) => o.status === "DRAFT").length,
    [orders],
  );
  const submittedCount = React.useMemo(
    () => orders.filter((o) => o.status === "SUBMITTED").length,
    [orders],
  );
  const fulfilledCount = React.useMemo(
    () => orders.filter((o) => o.status === "FULFILLED").length,
    [orders],
  );

  const handleSubmitPo = async (po: PurchaseOrderDto) => {
    setApiAlert(null);
    try {
      const updated = await purchaseOrdersApi.submit(po.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setToastMessage(
        `Purchase Order "${po.poNumber}" submitted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to submit purchase order");
      }
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancellingPo) return;
    setActionLoading(true);
    setApiAlert(null);
    try {
      const updated = await purchaseOrdersApi.cancel(cancellingPo.id);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setToastMessage(`Purchase Order "${cancellingPo.poNumber}" cancelled.`);
      setTimeout(() => setToastMessage(null), 4000);
      setCancellingPo(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to cancel purchase order");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPo) return;
    setActionLoading(true);
    setApiAlert(null);
    try {
      await purchaseOrdersApi.delete(deletingPo.id);
      setOrders((prev) => prev.filter((o) => o.id !== deletingPo.id));
      setToastMessage(
        `Purchase Order "${deletingPo.poNumber}" deleted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
      setDeletingPo(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete purchase order");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<PurchaseOrderDto>[]>(
    () => [
      {
        accessorKey: "poNumber",
        header: "PO Number",
        cell: ({ row }) => (
          <Link
            href={`/purchase-orders/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase"
          >
            {row.original.poNumber}
          </Link>
        ),
      },
      {
        accessorKey: "supplierId",
        header: "Supplier",
        cell: ({ row }) => {
          const sup = suppliersMap[row.original.supplierId];
          return (
            <span className="font-medium text-foreground">
              {sup ? sup.name : row.original.supplierId.slice(0, 8)}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
              row.original.status === "DRAFT"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                : row.original.status === "SUBMITTED"
                  ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                  : row.original.status === "FULFILLED"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : row.original.status === "CANCELLED"
                      ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                      : "bg-muted text-muted-foreground"
            }`}
          >
            {row.original.status}
          </span>
        ),
      },
      {
        accessorKey: "grandTotal",
        header: "Grand Total",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-foreground">
            {row.original.currency} {row.original.grandTotal.toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "expectedDeliveryDate",
        header: "Expected Delivery",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.expectedDeliveryDate
              ? new Date(row.original.expectedDeliveryDate).toLocaleDateString()
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Order Date",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const po = row.original;
          const isDraft = po.status === "DRAFT";
          const canCancel = ![
            "FULFILLED",
            "CANCELLED",
            "PARTIALLY_RECEIVED",
          ].includes(po.status);
          const canDelete = ["DRAFT", "CANCELLED"].includes(po.status);

          return (
            <div className="flex items-center justify-end gap-1">
              <Link href={`/purchase-orders/${po.id}`}>
                <Button variant="ghost" size="icon-xs" title="View PO details">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
              </Link>

              {isDraft && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Submit PO"
                    onClick={() => handleSubmitPo(po)}
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Edit draft PO"
                    onClick={() => {
                      setEditingPo(po);
                      setIsFormOpen(true);
                    }}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                  </Button>
                </>
              )}

              {canCancel && !isDraft && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Cancel PO"
                  onClick={() => setCancellingPo(po)}
                >
                  <Ban className="w-3.5 h-3.5 text-amber-500 hover:text-amber-600" />
                </Button>
              )}

              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete PO"
                  onClick={() => {
                    setApiAlert(null);
                    setDeletingPo(po);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [suppliersMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Submitted", value: "SUBMITTED" },
        { label: "Approved", value: "APPROVED" },
        { label: "Issued", value: "ISSUED" },
        { label: "Fulfilled", value: "FULFILLED" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
    },
  ];

  const handleFormSuccess = (savedPo: PurchaseOrderDto) => {
    if (editingPo) {
      setOrders((prev) => prev.map((o) => (o.id === savedPo.id ? savedPo : o)));
      setToastMessage(
        `Purchase Order "${savedPo.poNumber}" updated successfully.`,
      );
    } else {
      setOrders((prev) => [savedPo, ...prev]);
      setToastMessage(
        `Purchase Order "${savedPo.poNumber}" created successfully.`,
      );
    }
    setIsFormOpen(false);
    setEditingPo(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Purchase Orders"
        description="Transactional procurement orders connecting suppliers with inventory component purchasing."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingPo(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Purchase Order
          </Button>
        }
      />

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Purchase Orders"
          value={orders.length}
          subtitle="All recorded POs"
          icon={ShoppingBag}
        />
        <StatCard
          title="Draft Orders"
          value={draftCount}
          subtitle="Pending submission"
          icon={ShoppingBag}
        />
        <StatCard
          title="Submitted Orders"
          value={submittedCount}
          subtitle="Awaiting fulfillment"
          icon={ShoppingBag}
        />
        <StatCard
          title="Fulfilled Orders"
          value={fulfilledCount}
          subtitle="Completed inventory receipts"
          icon={ShoppingBag}
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
          <Button variant="ghost" size="xs" onClick={fetchOrders}>
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
          if (!open) {
            setEditingPo(null);
          }
        }}
        title={editingPo ? "Edit Purchase Order" : "Create Purchase Order"}
        description={
          editingPo
            ? `Revise purchase order "${editingPo.poNumber}" using the shared procurement dialog layout.`
            : "Create a new purchase order with standardized header, body, and footer composition."
        }
        size="lg"
      >
        <PurchaseOrderForm
          initialData={editingPo}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingPo(null);
          }}
        />
      </DialogShell>

      {/* Cancel Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancellingPo)}
        title="Cancel Purchase Order"
        description={`Are you sure you want to cancel Purchase Order "${cancellingPo?.poNumber}"?`}
        confirmText="Cancel PO"
        variant="destructive"
        loading={actionLoading}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancellingPo(null)}
      />

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingPo)}
        title="Delete Purchase Order"
        description={`Are you sure you want to delete Purchase Order "${deletingPo?.poNumber}"?`}
        confirmText="Delete PO"
        variant="destructive"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingPo(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={orders}
        searchKey="poNumber"
        searchPlaceholder="Search purchase orders by PO number..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No purchase orders found"
        emptyMessage="Get started by creating your first purchase order."
      />
    </div>
  );
}
