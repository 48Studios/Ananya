"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, TrendingUp, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  reportingApi,
  type FinancialSummaryDto,
} from "@/lib/api/reporting-api";
import { formatCurrency } from "@/lib/utils";

interface FinanceSummaryCategory {
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  totalAccounts: number;
  activeAccountsCount: number;
}

export default function FinancePage() {
  const [summary, setSummary] = React.useState<FinancialSummaryDto | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadSummary = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await reportingApi.getFinancialSummary());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load finance summary",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const categories = React.useMemo<FinanceSummaryCategory[]>(
    () =>
      (summary?.accountTypeDistribution ?? []).map((item) => ({
        accountType: item.accountType,
        totalAccounts: item.totalAccounts,
        activeAccountsCount: item.activeAccounts,
      })),
    [summary],
  );

  const columns: ColumnDef<FinanceSummaryCategory>[] = [
    {
      accessorKey: "accountType",
      header: "GL Category",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-primary">
          {row.original.accountType}
        </span>
      ),
    },
    {
      accessorKey: "accountType",
      header: "Category Type",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.accountType}
        </span>
      ),
    },
    {
      accessorKey: "activeAccountsCount",
      header: "Ledger Accounts",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.activeAccountsCount} accounts
        </span>
      ),
    },
    {
      accessorKey: "totalAccounts",
      header: "Accounts Tracked",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.totalAccounts}
        </span>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading finance summary..." />;
  }

  if (error || !summary) {
    return (
      <ErrorState
        title="Finance summary unavailable"
        message={error || "Unable to load finance analytics."}
        onRetry={loadSummary}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & General Ledger Executive Hub"
        description="Monitor general ledger accounts, trial balances, cash flow reserves, accounts payable/receivable, and financial reporting."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Receivables Outstanding"
          value={formatCurrency(summary.receivablesOutstanding)}
          icon={Landmark}
        />
        <StatCard
          title="Payables Outstanding"
          value={formatCurrency(summary.payablesOutstanding)}
          icon={TrendingUp}
        />
        <StatCard
          title="Open Reconciliations"
          value={summary.openReconciliations}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={categories}
        columns={columns}
        searchPlaceholder="Search finance categories..."
        loading={false}
        emptyTitle="No finance accounts"
        emptyMessage="No ledger accounts have been configured yet."
      />
    </div>
  );
}
