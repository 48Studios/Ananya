"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DollarSign, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { financeApi, type PaymentDto } from "@/lib/api/finance-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function PaymentsPage() {
  const [payments, setPayments] = React.useState<PaymentDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    financeApi
      .getPayments()
      .then((data) => {
        setPayments(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load payments",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnDef<PaymentDto>[] = [
    {
      accessorKey: "paymentNumber",
      header: "Payment Voucher No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.paymentNumber}
        </span>
      ),
    },
    {
      accessorKey: "reference",
      header: "Customer / Supplier Party",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.reference || "Not linked"}
        </span>
      ),
    },
    {
      accessorKey: "paymentType",
      header: "Voucher Type",
      cell: ({ row }) => {
        const isReceipt = row.original.paymentType === "CUSTOMER_PAYMENT";
        return (
          <span
            className={`font-mono text-xs px-2 py-0.5 rounded font-semibold border ${
              isReceipt
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
            }`}
          >
            {row.original.paymentType}
          </span>
        );
      },
    },
    {
      accessorKey: "amount",
      header: "Payment Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: "paymentMethod",
      header: "Payment Method",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.paymentMethod}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Payment Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading payments..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Payments unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Customer Cash Receipts"
        description="Record incoming customer receipts, vendor disbursements, and bank wire transfers."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Transactions Logged"
          value={payments.length}
          icon={DollarSign}
        />
        <StatCard
          title="Customer Cash Receipts"
          value={formatCurrency(
            payments
              .filter((payment) => payment.paymentType === "CUSTOMER_PAYMENT")
              .reduce((sum, payment) => sum + payment.amount, 0),
          )}
          icon={CheckCircle2}
        />
        <StatCard
          title="Vendor Disbursements"
          value={formatCurrency(
            payments
              .filter((payment) => payment.paymentType === "SUPPLIER_PAYMENT")
              .reduce((sum, payment) => sum + payment.amount, 0),
          )}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={payments}
        columns={columns}
        searchPlaceholder="Search payments by voucher # or party..."
        loading={false}
        emptyTitle="No payments"
        emptyMessage="No payment records are available."
      />
    </div>
  );
}
