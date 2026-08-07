"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DollarSign, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { financeApi, type ReceivableInvoiceDto } from "@/lib/api/finance-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AccountsReceivablePage() {
  const [entries, setEntries] = React.useState<ReceivableInvoiceDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    financeApi
      .getReceivableInvoices()
      .then((data) => {
        setEntries(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load receivable invoices",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const totalAr = entries.reduce((acc, entry) => acc + entry.balance, 0);

  const columns: ColumnDef<ReceivableInvoiceDto>[] = [
    {
      accessorKey: "customerId",
      header: "Customer Name",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-primary">
          {row.original.customerId}
        </span>
      ),
    },
    {
      accessorKey: "invoiceNumber",
      header: "Customer Invoice No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-medium">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      accessorKey: "balance",
      header: "Receivable Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.balance)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "AR Aging Status",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: "dueDate",
      header: "Payment Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.dueDate)}
        </span>
      ),
    },
  ];

  if (loading) {
  return <LoadingState message="Loading accounts receivable..." />;
  }

  if (error) {
  return (
    <ErrorState
      title="Accounts receivable unavailable"
      message={error}
      onRetry={() => window.location.reload()}
    />
  );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Receivable (AR) Aging & Receipts"
        description="Track customer invoices, payment collection aging, credit limits, and incoming cash flows."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Outstanding AR"
          value={formatCurrency(totalAr)}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Current Due (<30 Days)"
          value={formatCurrency(
            entries
              .filter((entry) => entry.status === "POSTED")
              .reduce((sum, entry) => sum + entry.balance, 0),
          )}
          icon={CheckCircle2}
        />
        <StatCard
          title="Overdue Accounts"
          value={entries.filter((entry) => new Date(entry.dueDate) < new Date() && entry.balance > 0).length}
          icon={Clock}
        />
      </div>

      <EntityDataTable
        data={entries}
        columns={columns}
        searchPlaceholder="Search AR by customer or invoice..."
        loading={false}
        emptyTitle="No receivable invoices"
        emptyMessage="No customer receivable records are available."
      />
    </div>
  );
}
