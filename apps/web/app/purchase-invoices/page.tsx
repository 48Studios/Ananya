"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  purchaseInvoicesApi,
  type PurchaseInvoiceDto,
} from "@/lib/api/purchase-invoices-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = React.useState<PurchaseInvoiceDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchInvoices = React.useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setInvoices((await purchaseInvoicesApi.getAll()) || []);
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

  const paidCount = React.useMemo(
    () => invoices.filter((invoice) => invoice.status === "PAID").length,
    [invoices],
  );

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Payment Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Matched", value: "MATCHED" },
        { label: "Variance Hold", value: "VARIANCE_HOLD" },
        { label: "Approved", value: "APPROVED" },
        { label: "Paid", value: "PAID" },
      ],
    },
  ];

  const columns: ColumnDef<PurchaseInvoiceDto>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Supplier Invoice No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      accessorKey: "supplierId",
      header: "Supplier",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.supplierId}
        </span>
      ),
    },
    {
      accessorKey: "purchaseOrderId",
      header: "Ref PO",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.purchaseOrderId}
        </span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Invoice Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalAmount)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        if (status === "PAID") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> {status}
          </span>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.dueDate)}
        </span>
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
        description="Process vendor invoices, match purchase orders to bills, and manage accounts payable schedules."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Invoices" value={invoices.length} icon={FileText} />
        <StatCard
          title="Outstanding Payable"
          value={formatCurrency(outstandingAmount)}
          icon={DollarSign}
        />
        <StatCard title="Paid Invoices" value={paidCount} icon={CheckCircle2} />
      </div>

      <EntityDataTable
        data={invoices}
        columns={columns}
        searchPlaceholder="Search vendor invoices by number, supplier, or PO..."
        loading={false}
        emptyTitle="No Vendor Invoices Found"
        emptyMessage="No vendor invoices have been recorded yet."
        filterConfigs={filterConfigs}
      />
    </div>
  );
}
