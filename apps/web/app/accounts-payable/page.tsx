"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DollarSign, Clock, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { financeApi, type PayableInvoiceDto } from "@/lib/api/finance-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function AccountsPayablePage() {
  const [entries, setEntries] = React.useState<PayableInvoiceDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    financeApi
      .getPayableInvoices()
      .then((data) => {
        setEntries(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load payable invoices",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const totalAp = entries.reduce((acc, entry) => acc + entry.balance, 0);

  const columns: ColumnDef<PayableInvoiceDto>[] = [
    {
      accessorKey: "supplierId",
      header: "Supplier Vendor",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-primary">
          {row.original.supplierId}
        </span>
      ),
    },
    {
      accessorKey: "invoiceNumber",
      header: "Invoice No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-medium">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      accessorKey: "balance",
      header: "Amount Payable",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.balance)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "AP Aging Bracket",
      cell: ({ row }) => {
        if (row.original.status === "POSTED") {
          return (
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              Current
            </span>
          );
        }
        return (
          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
            {row.original.status}
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
  return <LoadingState message="Loading accounts payable..." />;
  }

  if (error) {
  return (
    <ErrorState
      title="Accounts payable unavailable"
      message={error}
      onRetry={() => window.location.reload()}
    />
  );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts Payable (AP) Aging & Bills"
        description="Monitor vendor liabilities, aging brackets, payment schedules, and cash outflow projections."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Accounts Payable"
          value={formatCurrency(totalAp)}
          icon={<DollarSign className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          title="Current Due (<30 Days)"
          value={formatCurrency(
            entries
              .filter((entry) => entry.status === "POSTED")
              .reduce((sum, entry) => sum + entry.balance, 0),
          )}
          icon={Clock}
        />
        <StatCard
          title="Overdue Accounts"
          value={entries.filter((entry) => new Date(entry.dueDate) < new Date() && entry.balance > 0).length}
          icon={AlertCircle}
        />
      </div>

      <EntityDataTable
        data={entries}
        columns={columns}
        searchPlaceholder="Search AP by supplier or invoice..."
        loading={false}
        emptyTitle="No payable invoices"
        emptyMessage="No supplier payable records are available."
      />
    </div>
  );
}
