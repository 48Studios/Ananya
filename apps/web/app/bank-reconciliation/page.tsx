"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import {
  financeApi,
  type BankAccountSummaryDto,
  type BankReconciliationDto,
} from "@/lib/api/finance-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function BankReconciliationPage() {
  const [statements, setStatements] = React.useState<BankReconciliationDto[]>([]);
  const [accounts, setAccounts] = React.useState<BankAccountSummaryDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      financeApi.getBankReconciliations(),
      financeApi.getBankAccounts(),
    ])
      .then(([reconciliationData, accountData]) => {
        setStatements(reconciliationData);
        setAccounts(accountData);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load bank reconciliations",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const accountById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const columns: ColumnDef<BankReconciliationDto>[] = [
    {
      accessorKey: "id",
      header: "Statement Ref",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.id.slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    {
      accessorKey: "bankAccountId",
      header: "Bank Account",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {accountById.get(row.original.bankAccountId)?.accountName ||
            row.original.bankAccountId}
        </span>
      ),
    },
    {
      accessorKey: "closingBalance",
      header: "Bank Statement Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.closingBalance)}
        </span>
      ),
    },
    {
      accessorKey: "openingBalance",
      header: "Opening Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.openingBalance)}
        </span>
      ),
    },
    {
      accessorKey: "transactions",
      header: "Unmatched Variance",
      cell: ({ row }) => {
        const diff = row.original.transactions.filter((tx) => !tx.isMatched).length;
        if (diff === 0) {
          return (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Fully matched
            </span>
          );
        }
        return (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {diff} unmatched
          </span>
        );
      },
    },
    {
      accessorKey: "statementDate",
      header: "Statement Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.statementDate)}
        </span>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading bank reconciliations..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Bank reconciliations unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Statement Reconciliation Workspace"
        description="Match electronic bank statements with general ledger transactions and resolve variances."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Statements Processed"
          value={statements.length}
          icon={RefreshCw}
        />
        <StatCard
          title="Reconciliation Match"
          value={statements.filter((statement) => statement.status === "COMPLETED").length}
          icon={CheckCircle2}
        />
        <StatCard
          title="Unmatched Items"
          value={statements.reduce((sum, statement) => sum + statement.transactions.filter((transaction) => !transaction.isMatched).length, 0)}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={statements}
        columns={columns}
        searchPlaceholder="Search bank reconciliation statements..."
        loading={false}
        emptyTitle="No bank reconciliation statements"
        emptyMessage="No bank statement reconciliation data is available."
      />
    </div>
  );
}
