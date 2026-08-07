"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { financeApi, type BankAccountSummaryDto } from "@/lib/api/finance-api";
import { formatCurrency } from "@/lib/utils";

export default function BankAccountsPage() {
  const [accounts, setAccounts] = React.useState<BankAccountSummaryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    financeApi
      .getBankAccounts()
      .then((data) => {
        setAccounts(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load bank accounts",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const totalCash = accounts.reduce(
    (acc, account) => acc + (account.latestStatementBalance ?? 0),
    0,
  );

  const columns: ColumnDef<BankAccountSummaryDto>[] = [
    {
      accessorKey: "bankName",
      header: "Banking Institution",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-primary">
          {row.original.bankName}
        </span>
      ),
    },
    {
      accessorKey: "accountNumberMasked",
      header: "Account Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-semibold">
          {row.original.accountNumberMasked}
        </span>
      ),
    },
    {
      accessorKey: "accountName",
      header: "Account Name",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.accountName}
        </span>
      ),
    },
    {
      accessorKey: "latestStatementBalance",
      header: "Cleared Bank Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.latestStatementBalance === null
            ? "Unavailable"
            : formatCurrency(row.original.latestStatementBalance)}
        </span>
      ),
    },
    {
      accessorKey: "latestReconciliationStatus",
      header: "Reconciliation",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />{" "}
          {row.original.latestReconciliationStatus || "No statements"}
        </span>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading bank accounts..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Bank accounts unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Accounts & Liquidity Management"
        description="Monitor corporate bank balances, checking/savings liquid reserves, and bank feeds."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Cash Reserves"
          value={formatCurrency(totalCash)}
          icon={Landmark}
        />
        <StatCard
          title="Active Corporate Accounts"
          value={accounts.length}
          icon={CheckCircle2}
        />
        <StatCard
          title="Reconciliation Status"
          value={accounts.filter((account) => account.latestReconciliationStatus === "COMPLETED").length}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={accounts}
        columns={columns}
        searchPlaceholder="Search bank accounts..."
        loading={false}
        emptyTitle="No bank accounts"
        emptyMessage="No bank account records are available."
      />
    </div>
  );
}
