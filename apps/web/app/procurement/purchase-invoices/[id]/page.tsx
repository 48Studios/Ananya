"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Scale,
  ShieldCheck,
  CreditCard,
  Building2,
  Package,
  Layers,
  Loader2,
  Receipt,
  FileCheck,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { SectionCard } from "@/components/ui/section-card";
import {
  DetailFields,
  DetailField,
  DetailMono,
  DetailText,
} from "@/components/ui/detail-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  purchaseInvoicesApi,
  type PurchaseInvoiceDto,
  type PurchaseInvoiceStatus,
  type ThreeWayMatchStatus,
  type MatchResultDto,
} from "@/lib/api/purchase-invoices-api";
import { suppliersApi, type SupplierDto } from "@/lib/api/suppliers-api";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import {
  goodsReceiptsApi,
  type GoodsReceiptDto,
} from "@/lib/api/goods-receipts-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

function getPaymentStatusBadge(status: PurchaseInvoiceStatus) {
  switch (status) {
    case "PAID":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          PAID
        </span>
      );
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
          <ShieldCheck className="w-3 h-3 mr-1" />
          APPROVED
        </span>
      );
    case "MATCHED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <FileCheck className="w-3 h-3 mr-1" />
          MATCHED
        </span>
      );
    case "VARIANCE_HOLD":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          VARIANCE HOLD
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          CANCELLED
        </span>
      );
    case "DRAFT":
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          DRAFT
        </span>
      );
  }
}

function getMatchStatusBadge(matchStatus: ThreeWayMatchStatus) {
  switch (matchStatus) {
    case "MATCHED":
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          MATCHED
        </span>
      );
    case "PRICE_VARIANCE":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          PRICE VARIANCE
        </span>
      );
    case "QUANTITY_VARIANCE":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" />
          QTY VARIANCE
        </span>
      );
    case "PENDING":
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <Clock className="w-3 h-3 mr-1" />
          PENDING MATCH
        </span>
      );
  }
}

export default function PurchaseInvoiceDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [invoice, setInvoice] = React.useState<PurchaseInvoiceDto | null>(null);
  const [supplier, setSupplier] = React.useState<SupplierDto | null>(null);
  const [po, setPo] = React.useState<PurchaseOrderDto | null>(null);
  const [grs, setGrs] = React.useState<GoodsReceiptDto[]>([]);
  const [components, setComponents] = React.useState<ComponentDto[]>([]);
  const [matchDetails, setMatchDetails] = React.useState<string[] | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Dialog confirmation states
  const [confirmApproveOpen, setConfirmApproveOpen] = React.useState(false);
  const [confirmPayOpen, setConfirmPayOpen] = React.useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = React.useState(false);

  const loadInvoice = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const inv = await purchaseInvoicesApi.getById(id);
      setInvoice(inv);

      // Fetch related records in parallel
      const [sups, poData, grsData, comps] = await Promise.all([
        suppliersApi.getAll().catch(() => []),
        inv.purchaseOrderId
          ? purchaseOrdersApi.getById(inv.purchaseOrderId).catch(() => null)
          : Promise.resolve(null),
        inv.purchaseOrderId
          ? goodsReceiptsApi
              .getAll({ purchaseOrderId: inv.purchaseOrderId })
              .catch(() => [])
          : Promise.resolve([]),
        componentsApi.getAll().catch(() => []),
      ]);

      const foundSup = sups.find((s) => s.id === inv.supplierId) || null;
      setSupplier(foundSup);
      setPo(poData);
      setGrs(grsData);
      setComponents(comps);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load purchase invoice",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    loadInvoice();
  }, [loadInvoice]);

  const componentMap = React.useMemo(() => {
    const map = new Map<string, ComponentDto>();
    for (const c of components) map.set(c.id, c);
    return map;
  }, [components]);

  const handleRunMatch = async () => {
    if (!invoice) return;
    setActionBusy(true);
    setNotice(null);
    try {
      const res: MatchResultDto = await purchaseInvoicesApi.match(invoice.id);
      setInvoice(res.invoice);
      setMatchDetails(res.matchResult.details || []);

      if (res.matchResult.isMatch) {
        setNotice({
          type: "success",
          message:
            "3-Way Match Passed! Unit prices and billed quantities match the Purchase Order and Goods Receipts.",
        });
      } else {
        setNotice({
          type: "warning",
          message: `3-Way Match Discrepancy Found (${res.matchResult.varianceReason || "VARIANCE"}). Review details below.`,
        });
      }
    } catch (err) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "3-way match evaluation failed",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!invoice) return;
    setActionBusy(true);
    setNotice(null);
    try {
      const updated = await purchaseInvoicesApi.approve(invoice.id);
      setInvoice(updated);
      setConfirmApproveOpen(false);
      setNotice({
        type: "success",
        message: `Invoice ${invoice.invoiceNumber} approved for payment.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to approve invoice",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handlePay = async () => {
    if (!invoice) return;
    setActionBusy(true);
    setNotice(null);
    try {
      const updated = await purchaseInvoicesApi.pay(invoice.id);
      setInvoice(updated);
      setConfirmPayOpen(false);
      setNotice({
        type: "success",
        message: `Invoice ${invoice.invoiceNumber} recorded as PAID.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to mark invoice as paid",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!invoice) return;
    setActionBusy(true);
    setNotice(null);
    try {
      const updated = await purchaseInvoicesApi.cancel(invoice.id);
      setInvoice(updated);
      setConfirmCancelOpen(false);
      setNotice({
        type: "warning",
        message: `Invoice ${invoice.invoiceNumber} has been cancelled.`,
      });
    } catch (err) {
      setNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to cancel invoice",
      });
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading purchase invoice details..." />;
  }

  if (error || !invoice) {
    return (
      <ErrorState
        title="Purchase Invoice Not Found"
        message={error || "The requested purchase invoice could not be located."}
        onRetry={loadInvoice}
      />
    );
  }

  const isTerminal = invoice.status === "PAID" || invoice.status === "CANCELLED";

  return (
    <div className="space-y-6">
      {/* Top back navigation */}
      <div>
        <Link
          href="/procurement/purchase-invoices"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1.5 -ml-2 text-muted-foreground hover:text-foreground",
          )}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Purchase Invoices
        </Link>
      </div>

      {/* Page Header */}
      <PageHeader
        backHref="/procurement/purchase-invoices"
        backLabel="Back to Purchase Invoices"
        title={invoice.invoiceNumber}
        description={`Vendor Ref: ${invoice.vendorInvoiceNumber} • Supplier: ${
          supplier?.name || invoice.supplierId
        } • Created ${formatDate(invoice.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunMatch}
                disabled={actionBusy}
              >
                {actionBusy ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Scale className="w-3.5 h-3.5 mr-1.5 text-primary" />
                )}
                Run 3-Way Match
              </Button>
            )}

            {!isTerminal && invoice.status !== "APPROVED" && (
              <Button
                size="sm"
                onClick={() => setConfirmApproveOpen(true)}
                disabled={actionBusy}
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                Approve for Payment
              </Button>
            )}

            {invoice.status === "APPROVED" && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setConfirmPayOpen(true)}
                disabled={actionBusy}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                Mark as Paid
              </Button>
            )}

            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmCancelOpen(true)}
                disabled={actionBusy}
                className="text-destructive hover:bg-destructive/10"
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* Notice Banner */}
      {notice && (
        <div
          className={`p-4 rounded-lg border text-sm flex items-start justify-between gap-3 ${
            notice.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
              : notice.type === "warning"
                ? "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
                : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {notice.type === "warning" && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {notice.type === "error" && <XCircle className="w-4 h-4 shrink-0" />}
            <span>{notice.message}</span>
          </div>
          <button
            type="button"
            className="text-xs font-semibold opacity-70 hover:opacity-100"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stat Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Invoice Amount"
          value={formatCurrency(invoice.totalAmount)}
          icon={DollarSign}
        />
        <StatCard
          title="Payment Status"
          value={invoice.status}
          icon={FileText}
          subtitle="Workflow state"
        />
        <StatCard
          title="3-Way Match"
          value={invoice.matchStatus}
          icon={Scale}
          subtitle="PO & GR Reconciliation"
        />
        <StatCard
          title="Due Date"
          value={formatDate(invoice.dueDate)}
          icon={Calendar}
          subtitle="Payment deadline"
        />
      </div>

      {/* 3-Way Match Discrepancy Breakdown (if active) */}
      {(matchDetails && matchDetails.length > 0) ||
      invoice.matchStatus === "PRICE_VARIANCE" ||
      invoice.matchStatus === "QUANTITY_VARIANCE" ? (
        <SectionCard
          title="3-Way Reconciliation Findings"
          icon={Scale}
          description="Automated match comparison between invoice lines, Purchase Order lines, and Goods Receipts."
        >
          <div className="space-y-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-300 text-xs">
              <span className="font-semibold block mb-1">
                Discrepancy Detected ({invoice.matchStatus}):
              </span>
              {matchDetails && matchDetails.length > 0 ? (
                <ul className="list-disc list-inside space-y-1">
                  {matchDetails.map((detail, idx) => (
                    <li key={idx}>{detail}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  Unit prices or billed quantities on this vendor invoice do not exactly match
                  the PO or received goods receipts. You may approve the invoice to override or
                  contact the supplier for an amended invoice.
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Section: Master Invoice Details */}
      <SectionCard
        title="Invoice Information"
        icon={Receipt}
        description="Core invoice metadata, supplier relationship, and linked purchasing documents."
      >
        <DetailFields className="lg:grid-cols-3 xl:grid-cols-4">
          <DetailField label="Invoice Number">
            <DetailMono className="text-sm font-semibold text-primary">
              {invoice.invoiceNumber}
            </DetailMono>
          </DetailField>

          <DetailField label="Vendor Invoice Ref">
            <DetailMono className="text-sm">
              {invoice.vendorInvoiceNumber}
            </DetailMono>
          </DetailField>

          <DetailField label="Supplier">
            {supplier ? (
              <Link
                href={`/procurement/master/suppliers/${supplier.id}`}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                {supplier.name}
              </Link>
            ) : (
              <DetailText>{invoice.supplierId}</DetailText>
            )}
          </DetailField>

          <DetailField label="Reference Purchase Order">
            {po ? (
              <Link
                href={`/procurement/purchase-orders/${po.id}`}
                className="text-sm font-mono font-medium text-primary hover:underline flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                {po.poNumber}
              </Link>
            ) : (
              <DetailMono className="text-xs">{invoice.purchaseOrderId}</DetailMono>
            )}
          </DetailField>

          <DetailField label="Linked Goods Receipt">
            {invoice.goodsReceiptId ? (
              <Link
                href={`/procurement/goods-receipts/${invoice.goodsReceiptId}`}
                className="text-sm font-mono text-primary hover:underline flex items-center gap-1"
              >
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                {grs.find((g) => g.id === invoice.goodsReceiptId)?.grNumber ||
                  invoice.goodsReceiptId.slice(0, 8)}
              </Link>
            ) : (
              <DetailText>Not explicitly linked</DetailText>
            )}
          </DetailField>

          <DetailField label="Payment Status">
            <div>{getPaymentStatusBadge(invoice.status)}</div>
          </DetailField>

          <DetailField label="3-Way Match Status">
            <div>{getMatchStatusBadge(invoice.matchStatus)}</div>
          </DetailField>

          <DetailField label="Due Date">
            <DetailText className="font-medium">
              {formatDate(invoice.dueDate)}
            </DetailText>
          </DetailField>

          <DetailField label="Total Billed Amount">
            <DetailMono className="text-sm font-bold text-foreground">
              {formatCurrency(invoice.totalAmount)}
            </DetailMono>
          </DetailField>

          <DetailField label="Created At">
            <DetailText>{new Date(invoice.createdAt).toLocaleString()}</DetailText>
          </DetailField>

          <DetailField label="Last Updated">
            <DetailText>{new Date(invoice.updatedAt).toLocaleString()}</DetailText>
          </DetailField>
        </DetailFields>
      </SectionCard>

      {/* Section: Billed Line Items */}
      <SectionCard
        title="Billed Line Items"
        icon={Layers}
        description={`Itemized list of components billed by the vendor (${
          invoice.lines?.length || 0
        } items).`}
        contentClassName="p-0"
      >
        {!invoice.lines || invoice.lines.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No line items recorded on this invoice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Component</th>
                  <th className="px-6 py-3 font-medium">Part Number</th>
                  <th className="px-6 py-3 font-medium text-right">Quantity Billed</th>
                  <th className="px-6 py-3 font-medium text-right">Unit Price</th>
                  <th className="px-6 py-3 font-medium text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.lines.map((line) => {
                  const comp = componentMap.get(line.componentId);
                  return (
                    <tr key={line.id} className="hover:bg-muted/15 transition-colors">
                      <td className="px-6 py-3.5">
                        <Link
                          href={`/inventory/components/${line.componentId}`}
                          className="font-medium text-primary hover:underline flex items-center gap-1.5"
                        >
                          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {comp?.name || line.componentId}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                        {comp?.sku || comp?.manufacturerPartNumber || "—"}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-medium">
                        {line.quantityBilled}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-foreground">
                        {formatCurrency(line.lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20 font-semibold">
                  <td colSpan={4} className="px-6 py-3.5 text-right text-xs uppercase tracking-wider text-muted-foreground">
                    Total Invoice Amount:
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono text-base font-bold text-foreground">
                    {formatCurrency(invoice.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={confirmApproveOpen}
        title="Approve Purchase Invoice"
        description={`Are you sure you want to approve invoice ${invoice.invoiceNumber} for payment? Once approved, it can be scheduled for payment release.`}
        confirmText="Approve Invoice"
        variant="default"
        loading={actionBusy}
        onConfirm={handleApprove}
        onCancel={() => setConfirmApproveOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirmPayOpen}
        title="Record Invoice Payment"
        description={`Confirm that payment of ${formatCurrency(
          invoice.totalAmount,
        )} has been remitted to ${supplier?.name || "supplier"} for invoice ${
          invoice.invoiceNumber
        }. This will mark the invoice as PAID.`}
        confirmText="Record Paid"
        variant="default"
        loading={actionBusy}
        onConfirm={handlePay}
        onCancel={() => setConfirmPayOpen(false)}
      />

      <ConfirmDialog
        isOpen={confirmCancelOpen}
        title="Cancel Purchase Invoice"
        description={`Are you sure you want to cancel invoice ${invoice.invoiceNumber}? This action stops all payment processing for this bill.`}
        confirmText="Cancel Invoice"
        variant="destructive"
        loading={actionBusy}
        onConfirm={handleCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
    </div>
  );
}
