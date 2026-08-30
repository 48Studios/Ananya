"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Edit3,
  Trash2,
  ArrowLeft,
  Send,
  Printer,
  Ban,
  Building2,
  Calendar,
  DollarSign,
  FileText,
  CheckCircle2,
  Package,
  Truck,
  ExternalLink,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { PurchaseOrderForm } from "@/components/purchase-orders/po-form";
import { GoodsReceiptForm } from "@/components/goods-receipts/gr-form";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
  type PurchaseOrderStatus,
} from "@/lib/api/purchase-orders-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import {
  getAutoTrackingUrl,
  getShippingProviderName,
} from "@/lib/shipping-carriers";

const statusSteps: PurchaseOrderStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "ISSUED",
  "PARTIALLY_RECEIVED",
  "FULFILLED",
];

export default function ViewPurchaseOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [po, setPo] = React.useState<PurchaseOrderDto | null>(null);
  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null);
  const [componentMap, setComponentMap] = React.useState<
    Record<string, ComponentDto>
  >({} );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isCancelOpen, setIsCancelOpen] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const financialTotals = React.useMemo(() => {
    if (!po) return { subtotal: 0, taxTotal: 0, grandTotal: 0 };
    const storedGrand = Number(po.grandTotal) || 0;
    const storedSub = Number(po.subtotal) || 0;
    const storedTax = Number(po.taxTotal) || 0;

    if (
      storedGrand > 0 ||
      (storedSub > 0 && (!po.lines || po.lines.length === 0))
    ) {
      return {
        subtotal: storedSub,
        taxTotal: storedTax,
        grandTotal: storedGrand || storedSub + storedTax,
      };
    }

    let sub = 0;
    let tax = 0;
    for (const line of po.lines || []) {
      const uPrice = Number(line.unitPrice) || 0;
      const qOrd = Number(line.quantityOrdered) || 0;
      const tRate = Number(line.taxRate) || 0;
      const base = uPrice * qOrd;
      const lineTax = base * (tRate / 100);
      sub += base;
      tax += lineTax;
    }
    return {
      subtotal: sub,
      taxTotal: tax,
      grandTotal: sub + tax,
    };
  }, [po]);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseOrdersApi.getById(id);
      setPo(data);

      const [supData, comps] = await Promise.all([
        suppliersApi.getById(data.supplierId).catch(() => null),
        componentsApi.getAll().catch(() => []),
      ]);

      if (supData) setSupplier(supData);
      const map: Record<string, ComponentDto> = {};
      for (const c of comps) {
        map[c.id] = c;
      }
      setComponentMap(map);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load purchase order details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!id) return;
    setActionLoading(true);
    setApiError(null);
    try {
      const updated = await purchaseOrdersApi.submit(id);
      setPo(updated);
      setToastMessage(
        `Purchase Order ${updated.poNumber} submitted successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Failed to submit purchase order");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading(true);
    setApiError(null);
    try {
      const updated = await purchaseOrdersApi.cancel(id);
      setPo(updated);
      setIsCancelOpen(false);
      setToastMessage(`Purchase Order ${updated.poNumber} cancelled.`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Failed to cancel purchase order");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setActionLoading(true);
    setApiError(null);
    try {
      await purchaseOrdersApi.delete(id);
      router.push("/purchase-orders");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError("Failed to delete purchase order");
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading purchase order details..." />;
  }

  if (error || !po) {
    return (
      <ErrorState
        title="Purchase Order Not Found"
        message={error || "The requested purchase order record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  const currentStepIndex = statusSteps.indexOf(po.status);
  const isDraft = po.status === "DRAFT";
  const isCancelled = po.status === "CANCELLED";
  const canCancel = !["FULFILLED", "CANCELLED", "PARTIALLY_RECEIVED"].includes(
    po.status,
  );
  const canDelete = ["DRAFT", "CANCELLED"].includes(po.status);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={po.poNumber}
        description={`Supplier: ${supplier?.name || po.supplierId}`}
        breadcrumbs={[
          { label: "Purchase Orders", href: "/purchase-orders" },
          { label: po.poNumber },
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/purchase-orders")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>

            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print
            </Button>

            {isDraft && (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Send className="w-4 h-4 mr-1.5" />
                Submit PO
              </Button>
            )}

            {po.status !== "CANCELLED" && po.status !== "FULFILLED" && (
              <Button
                size="sm"
                onClick={() => setIsReceiveOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <PackageCheck className="w-4 h-4 mr-1.5" />
                Receive Goods
              </Button>
            )}

            {po.status !== "CANCELLED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(true)}
              >
                <Edit3 className="w-4 h-4 mr-1.5" />
                Edit
              </Button>
            )}

            {canCancel && !isDraft && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setApiError(null);
                  setIsCancelOpen(true);
                }}
              >
                <Ban className="w-4 h-4 mr-1.5 text-amber-500" />
                Cancel PO
              </Button>
            )}

            {canDelete && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setApiError(null);
                  setIsDeleteOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      {/* Notifications */}
      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg print:hidden">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {apiError && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg print:hidden">
          {apiError}
        </div>
      )}

      {/* Status Timeline Progress Indicator */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-xs print:hidden">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Order Status Workflow
        </h3>
        {isCancelled ? (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
            <Ban className="w-4 h-4" />
            <span>This Purchase Order has been Cancelled.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {statusSteps.map((step, idx) => {
              const isPassed = currentStepIndex >= idx;
              const isCurrent = currentStepIndex === idx;
              return (
                <div
                  key={step}
                  className={`p-2.5 rounded-lg text-center text-xs font-medium border transition-all ${
                    isCurrent
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                      : isPassed
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted/30 text-muted-foreground border-border"
                  }`}
                >
                  {step.replace("_", " ")}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stat Cards Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Grand Total"
          value={`${po.currency} ${po.grandTotal.toFixed(2)}`}
          subtitle="Total PO valuation"
          icon={DollarSign}
        />
        <StatCard
          title="Line Items"
          value={po.lines.length}
          subtitle="Ordered component lines"
          icon={Package}
        />
        <StatCard
          title="Supplier"
          value={supplier?.code || po.supplierId.slice(0, 8)}
          subtitle={supplier?.name || "Vendor record"}
          icon={Building2}
        />
        <StatCard
          title="Expected Delivery"
          value={
            po.expectedDeliveryDate
              ? new Date(po.expectedDeliveryDate).toLocaleDateString()
              : "Unscheduled"
          }
          subtitle="Fulfillment target"
          icon={Calendar}
        />
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata Info */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Purchase Order Details
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Commercial parameters and supplier references.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                PO Number
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {po.poNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                    po.status === "DRAFT"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                      : po.status === "SUBMITTED"
                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                        : po.status === "FULFILLED"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                          : po.status === "CANCELLED"
                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                            : "bg-muted text-muted-foreground"
                  }`}
                >
                  {po.status}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Supplier Name
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {supplier ? (
                  <Link
                    href={`/suppliers/${supplier.id}`}
                    className="hover:underline"
                  >
                    {supplier.name} ({supplier.code})
                  </Link>
                ) : (
                  po.supplierId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Currency
              </dt>
              <dd className="mt-1 font-mono text-xs text-foreground uppercase">
                {po.currency}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Issued Date
              </dt>
              <dd className="mt-1 text-xs text-foreground">
                {po.issuedAt
                  ? new Date(po.issuedAt).toLocaleString()
                  : "Not issued yet"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Expected Delivery
              </dt>
              <dd className="mt-1 text-xs text-foreground">
                {po.expectedDeliveryDate
                  ? new Date(po.expectedDeliveryDate).toLocaleDateString()
                  : "—"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Truck className="w-3.5 h-3.5" /> Shipping Provider
              </dt>
              <dd className="mt-1 text-xs text-foreground font-medium">
                {getShippingProviderName(po.shippingProvider || po.carrier)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Tracking / AWB #
              </dt>
              <dd className="mt-1 text-xs font-mono text-foreground flex items-center gap-2">
                {po.trackingNumber ? (
                  <>
                    <span className="font-semibold">{po.trackingNumber}</span>
                    {(() => {
                      const trackUrl = getAutoTrackingUrl(
                        po.shippingProvider || po.carrier,
                        po.trackingNumber,
                        po.trackingUrl,
                      );
                      return trackUrl ? (
                        <a
                          href={trackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-sans font-medium bg-primary/10 px-2 py-0.5 rounded"
                        >
                          <span>Track Shipment</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <span className="text-muted-foreground font-sans">
                    Unassigned
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {po.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Notes / Terms
              </span>
              <p className="text-xs text-foreground bg-muted/20 p-3 rounded-lg border border-border">
                {po.notes}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Created: {new Date(po.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(po.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Totals Financial Summary Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">
            Financial Summary
          </h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground text-xs">Subtotal</dt>
              <dd className="font-mono text-xs text-foreground">
                {po.currency} {financialTotals.subtotal.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground text-xs">Tax Total</dt>
              <dd className="font-mono text-xs text-foreground">
                {po.currency} {financialTotals.taxTotal.toFixed(2)}
              </dd>
            </div>
            <div className="pt-3 border-t border-border flex justify-between items-baseline">
              <dt className="text-sm font-semibold text-foreground">
                Grand Total
              </dt>
              <dd className="font-mono text-base font-bold text-foreground">
                {po.currency} {financialTotals.grandTotal.toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Line Items Table Card */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Ordered Component Lines
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Specific parts, target order quantities, and received totals.
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {po.lines.length} items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground font-medium text-xs border-b border-border">
              <tr>
                <th className="px-6 py-3">Component / Part</th>
                <th className="px-6 py-3">Vendor SKU</th>
                <th className="px-6 py-3 text-right">Unit Price</th>
                <th className="px-6 py-3 text-center">Ordered</th>
                <th className="px-6 py-3 text-center">Received</th>
                <th className="px-6 py-3 text-right">Tax Rate</th>
                <th className="px-6 py-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {po.lines.map((line) => {
                const comp = componentMap[line.componentId];
                const isFullyReceived =
                  line.quantityReceived >= line.quantityOrdered;
                return (
                  <tr key={line.id} className="hover:bg-muted/20">
                    <td className="px-6 py-3.5">
                      <div className="font-medium text-foreground">
                        {comp ? comp.name : line.componentId}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {comp?.sku}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                      {line.vendorPartNumber || "—"}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-right text-foreground">
                      {po.currency} {line.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-center text-foreground font-medium">
                      {line.quantityOrdered} {comp?.unit || "units"}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-mono font-medium rounded-full ${
                          isFullyReceived
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : line.quantityReceived > 0
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {line.quantityReceived} / {line.quantityOrdered}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-right text-muted-foreground">
                      {line.taxRate}%
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs font-semibold text-right text-foreground">
                      {po.currency} {line.lineTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receive Goods Modal */}
      <DialogShell
        open={isReceiveOpen}
        onOpenChange={setIsReceiveOpen}
        title={`Receive Goods against ${po.poNumber}`}
        description={`Capture incoming shipment and stock line items into inventory storage locations.`}
        size="md"
        contentClassName="print:hidden"
      >
        <GoodsReceiptForm
          initialPo={po}
          initialPurchaseOrderId={po.id}
          onSuccess={() => {
            setIsReceiveOpen(false);
            fetchData();
            setToastMessage(
              `Goods received and inventory stocked successfully for ${po.poNumber}.`,
            );
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsReceiveOpen(false)}
        />
      </DialogShell>

      {/* Edit Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title={`Edit Purchase Order (${po.poNumber})`}
        description={`Revise purchase order "${po.poNumber}" commercial and tracking details.`}
        size="lg"
        contentClassName="print:hidden"
      >
        <PurchaseOrderForm
          initialData={po}
          onSuccess={(updated) => {
            setPo(updated);
            setIsEditOpen(false);
            setToastMessage(
              `Purchase Order ${updated.poNumber} updated successfully.`,
            );
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isCancelOpen}
        title="Cancel Purchase Order"
        description={`Are you sure you want to cancel Purchase Order "${po.poNumber}"?`}
        confirmText="Cancel PO"
        variant="destructive"
        loading={actionLoading}
        onConfirm={handleCancel}
        onCancel={() => setIsCancelOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        title="Delete Purchase Order"
        description={`Are you sure you want to permanently delete Purchase Order "${po.poNumber}"? This action cannot be undone.`}
        confirmText="Delete PO"
        variant="destructive"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
