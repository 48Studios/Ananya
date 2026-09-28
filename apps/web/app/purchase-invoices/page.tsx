"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  CheckCircle2,
  Clock,
  DollarSign,
  Plus,
  Eye,
  Scale,
  Building2,
  AlertTriangle,
  ShieldCheck,
  FileCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DialogShell } from "@/components/ui/dialog-shell";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  purchaseInvoicesApi,
  type PurchaseInvoiceDto,
  type PurchaseInvoiceStatus,
  type ThreeWayMatchStatus,
} from "@/lib/api/purchase-invoices-api";
import { suppliersApi } from "@/lib/api/suppliers-api";
import {
  purchaseOrdersApi,
} from "@/lib/api/purchase-orders-api";
import { PurchaseInvoiceForm } from "@/components/purchase-invoices/purchase-invoice-form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, formatDate } from "@/lib/utils";

function getPaymentBadge(status: PurchaseInvoiceStatus) {
  switch (status) {
    case "PAID":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
        </span>
      );
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20">
          <ShieldCheck className="w-3 h-3 mr-1" /> Approved
        </span>
      );
    case "MATCHED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <FileCheck className="w-3 h-3 mr-1" /> Matched
        </span>
      );
    case "VARIANCE_HOLD":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" /> Variance Hold
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" /> Cancelled
        </span>
      );
    case "DRAFT":
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" /> Draft
        </span>
      );
  }
}

function getMatchBadge(matchStatus: ThreeWayMatchStatus) {
  switch (matchStatus) {
    case "MATCHED":
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Matched
        </span>
      );
    case "PRICE_VARIANCE":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" /> Price Variance
        </span>
      );
    case "QUANTITY_VARIANCE":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3 mr-1" /> Qty Variance
        </span>
      );
    case "PENDING":
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <Clock className="w-3 h-3 mr-1" /> Pending
        </span>
      );
  }
}

export default function PurchaseInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = React.useState<PurchaseInvoiceDto[]>([]);
  const [suppliersMap, setSuppliersMap] = React.useState<Record<string, string>>({});
  const [posMap, setPosMap] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const fetchInvoices = React.useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const [invData, sups, pos] = await Promise.all([
        purchaseInvoicesApi.getAll().catch(() => []),
        suppliersApi.getAll().catch(() => []),
        purchaseOrdersApi.getAll().catch(() => []),
      ]);
      setInvoices(invData || []);

      const sMap: Record<string, string> = {};
      for (const s of sups) sMap[s.id] = s.name;
      setSuppliersMap(sMap);

      const pMap: Record<string, string> = {};
      for (const p of pos) pMap[p.id] = p.poNumber;
      setPosMap(pMap);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load vendor invoices",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const outstandingAmount = React.useMemo(
    () =>
      invoices
        .filter(
          (invoice) =>
            invoice.status !== "PAID" && invoice.status !== "CANCELLED",
        )
        .reduce((acc, invoice) => acc + (invoice.totalAmount || 0), 0),
    [invoices],
  );

  const totalBilled = React.useMemo(
    () => invoices.reduce((acc, inv) => acc + (inv.totalAmount || 0), 0),
    [invoices],
  );

  const paidCount = React.useMemo(
    () => invoices.filter((invoice) => invoice.status === "PAID").length,
    [invoices],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Payment Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Matched", value: "MATCHED" },
        { label: "Variance Hold", value: "VARIANCE_HOLD" },
        { label: "Approved", value: "APPROVED" },
        { label: "Paid", value: "PAID" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
    },
    {
      columnId: "matchStatus",
      title: "3-Way Match",
      options: [
        { label: "Pending", value: "PENDING" },
        { label: "Matched", value: "MATCHED" },
        { label: "Price Variance", value: "PRICE_VARIANCE" },
        { label: "Qty Variance", value: "QUANTITY_VARIANCE" },
        { label: "Approved", value: "APPROVED" },
      ],
    },
  ];

  const columns: ColumnDef<PurchaseInvoiceDto>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Invoice No.",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[140px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/purchase-invoices/${row.original.id}`}
                    title={row.original.invoiceNumber}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.invoiceNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.invoiceNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "vendorInvoiceNumber",
      header: "Vendor Invoice Ref",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.vendorInvoiceNumber || "—"}
        </span>
      ),
    },
    {
      accessorKey: "supplierId",
      header: "Supplier",
      cell: ({ row }) => {
        const supName =
          suppliersMap[row.original.supplierId] || row.original.supplierId;
        return (
          <Link
            href={`/suppliers/${row.original.supplierId}`}
            className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[180px]">{supName}</span>
          </Link>
        );
      },
    },
    {
      accessorKey: "purchaseOrderId",
      header: "Ref PO",
      cell: ({ row }) => {
        const poNumber =
          posMap[row.original.purchaseOrderId] ||
          row.original.purchaseOrderId.slice(0, 8);
        return (
          <div className="min-w-0 max-w-[130px]">
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={`/purchase-orders/${row.original.purchaseOrderId}`}
                      title={poNumber}
                      className="font-mono text-xs text-muted-foreground hover:text-foreground bg-muted/30 px-1.5 py-0.5 rounded transition-colors uppercase inline-block truncate max-w-full align-middle"
                    />
                  }
                >
                  {poNumber}
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-xs">
                  {poNumber}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    },
    {
      accessorKey: "totalAmount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalAmount)}
        </span>
      ),
    },
    {
      accessorKey: "matchStatus",
      header: "3-Way Match",
      cell: ({ row }) => getMatchBadge(row.original.matchStatus),
    },
    {
      accessorKey: "status",
      header: "Payment Status",
      cell: ({ row }) => getPaymentBadge(row.original.status),
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(row.original.dueDate)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="text-right block w-full">Actions</span>,
      meta: {
        width: "8%",
        headerClassName: "text-right",
        cellClassName: "text-right",
      },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/purchase-invoices/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View details & actions"
              aria-label="View details & actions"
            >
              <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading purchase invoices..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Purchase invoices unavailable"
        message={error}
        onRetry={fetchInvoices}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Invoices & AP Bills"
        description="Process vendor invoices, reconcile purchase orders to bills with 3-way matching, and manage accounts payable."
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Invoice
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Invoices"
          value={invoices.length}
          icon={FileText}
        />
        <StatCard
          title="Outstanding Payable"
          value={formatCurrency(outstandingAmount)}
          icon={DollarSign}
        />
        <StatCard
          title="Paid Invoices"
          value={paidCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Total Billed"
          value={formatCurrency(totalBilled)}
          icon={Scale}
        />
      </div>

      <EntityDataTable
        data={invoices}
        columns={columns}
        searchPlaceholder="Search vendor invoices by number, supplier, or PO..."
        loading={false}
        emptyTitle="No Vendor Invoices Found"
        emptyMessage="No vendor invoices have been recorded yet. Click 'Create Invoice' to record a bill."
        filterConfigs={filterConfigs}
      />

      {/* New Purchase Invoice Dialog */}
      <DialogShell
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="New Purchase Invoice"
        description="Record a vendor invoice, link it to a Purchase Order, and verify billed line items."
        size="lg"
      >
        <PurchaseInvoiceForm
          onSuccess={(newInv) => {
            setIsCreateOpen(false);
            fetchInvoices();
            router.push(`/purchase-invoices/${newInv.id}`);
          }}
          onCancel={() => setIsCreateOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
