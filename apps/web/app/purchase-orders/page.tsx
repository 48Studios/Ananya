"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ExternalLink,
  PackageCheck,
  MoreVertical,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PurchaseOrderForm } from "@/components/purchase-orders/po-form";
import { GoodsReceiptForm } from "@/components/goods-receipts/gr-form";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import {
  getAutoTrackingUrl,
  getShippingProviderName,
} from "@/lib/shipping-carriers";

export default function PurchaseOrdersPage() {
  const router = useRouter();
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
  const [receivingPo, setReceivingPo] = React.useState<PurchaseOrderDto | null>(
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to cancel purchase order");
      }
    } finally {
      setCancellingPo(null);
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiAlert(err.message);
      } else {
        setApiAlert("Failed to delete purchase order");
      }
    } finally {
      setDeletingPo(null);
      setActionLoading(false);
    }
  };

  const columns = React.useMemo<ColumnDef<PurchaseOrderDto>[]>(
    () => [
      {
        accessorKey: "poNumber",
        header: "PO Number",
        meta: { width: "12%" },
        cell: ({ row }) => (
          <Link
            href={`/purchase-orders/${row.original.id}`}
            className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase whitespace-nowrap inline-block"
          >
            {row.original.poNumber}
          </Link>
        ),
      },
      {
        accessorKey: "supplierId",
        header: "Supplier",
        meta: { width: "21%" },
        cell: ({ row }) => {
          const sup = suppliersMap[row.original.supplierId];
          return (
            <div className="min-w-0">
              <span
                className="font-medium text-foreground truncate block"
                title={sup ? sup.name : row.original.supplierId}
              >
                {sup ? sup.name : row.original.supplierId.slice(0, 8)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        meta: { width: "10%" },
        cell: ({ row }) => (
          <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
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
        meta: { width: "13%" },
        cell: ({ row }) => {
          const po = row.original;
          let total = Number(po.grandTotal) || 0;
          if (total === 0 && po.lines && po.lines.length > 0) {
            total = po.lines.reduce((sum, l) => {
              const base =
                (Number(l.unitPrice) || 0) * (Number(l.quantityOrdered) || 0);
              const tax = base * ((Number(l.taxRate) || 0) / 100);
              return sum + base + tax;
            }, 0);
          }
          return (
            <span className="font-mono text-xs font-semibold text-foreground whitespace-nowrap inline-block">
              {po.currency} {total.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: "expectedDeliveryDate",
        header: "Expected Delivery",
        meta: { width: "12%" },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {row.original.expectedDeliveryDate
              ? new Date(row.original.expectedDeliveryDate).toLocaleDateString()
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "trackingNumber",
        header: "Shipment / Tracking",
        meta: { width: "14%" },
        cell: ({ row }) => {
          const po = row.original;
          if (!po.trackingNumber) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          const providerName = getShippingProviderName(
            po.shippingProvider || po.carrier,
          );
          const trackUrl = getAutoTrackingUrl(
            po.shippingProvider || po.carrier,
            po.trackingNumber,
            po.trackingUrl,
          );

          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-medium text-foreground bg-muted/60 px-1.5 py-0.5 rounded shrink-0">
                {providerName !== "—" ? providerName : "Courier"}
              </span>
              {trackUrl ? (
                <a
                  href={trackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-0.5 truncate"
                  title="Track shipment package"
                >
                  <span className="truncate">{po.trackingNumber}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : (
                <span className="font-mono text-xs text-muted-foreground truncate">
                  {po.trackingNumber}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Order Date",
        meta: { width: "10%" },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        meta: {
          width: "8%",
          headerClassName: "text-right",
          cellClassName: "text-right",
        },
        cell: ({ row }) => {
          const po = row.original;
          const isDraft = po.status === "DRAFT";
          const canReceive =
            po.status !== "CANCELLED" && po.status !== "FULFILLED";
          const canEdit = po.status !== "CANCELLED";
          const canCancel = ![
            "FULFILLED",
            "CANCELLED",
            "PARTIALLY_RECEIVED",
          ].includes(po.status);
          const canDelete = ["DRAFT", "CANCELLED"].includes(po.status);

          return (
            <div className="flex items-center justify-end gap-1">
              {isDraft && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Submit PO"
                  onClick={() => handleSubmitPo(po)}
                >
                  <Send className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700" />
                </Button>
              )}

              {canReceive && !isDraft && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Receive Goods against PO"
                  onClick={() => setReceivingPo(po)}
                >
                  <PackageCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700" />
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="More actions"
                      className="data-open:bg-muted"
                    >
                      <MoreVertical className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => router.push(`/purchase-orders/${po.id}`)}
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>View Details</span>
                  </DropdownMenuItem>

                  {canEdit && (
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingPo(po);
                        setIsFormOpen(true);
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>
                        {isDraft ? "Edit Order" : "Edit Tracking & Delivery"}
                      </span>
                    </DropdownMenuItem>
                  )}

                  {canCancel && !isDraft && (
                    <DropdownMenuItem
                      onClick={() => setCancellingPo(po)}
                      className="text-amber-600 dark:text-amber-400"
                    >
                      <Ban className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Cancel Order</span>
                    </DropdownMenuItem>
                  )}

                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setApiAlert(null);
                          setDeletingPo(po);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [suppliersMap, router],
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
        size="md"
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

      {/* Receive Goods Dialog */}
      <DialogShell
        open={Boolean(receivingPo)}
        onOpenChange={(open) => {
          if (!open) setReceivingPo(null);
        }}
        title={`Receive Goods against ${receivingPo?.poNumber}`}
        description="Process physical inventory receipt and post items to warehouse stock."
        size="md"
      >
        {receivingPo && (
          <GoodsReceiptForm
            initialPo={receivingPo}
            initialPurchaseOrderId={receivingPo.id}
            onSuccess={(savedGr) => {
              setReceivingPo(null);
              setToastMessage(
                `Goods receipt "${savedGr.grNumber}" processed successfully for ${receivingPo.poNumber}.`,
              );
              setTimeout(() => setToastMessage(null), 4000);
              fetchOrders();
            }}
            onCancel={() => setReceivingPo(null)}
          />
        )}
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
                <Button variant="ghost" size="xs" onClick={fetchOrders}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Retry
                </Button>
              </div>
            )}
          </>
        }
        columns={columns}
        data={orders}
        entityType="PurchaseOrder"
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
