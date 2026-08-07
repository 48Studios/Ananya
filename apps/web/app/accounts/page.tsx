"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { financeApi, type LedgerAccountDto } from "@/lib/api/finance-api";

export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<LedgerAccountDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    financeApi
      .getAccounts()
      .then((data) => {
        setAccounts(data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      })
      .finally(() => setLoading(false));
  }, []);

  const filterConfigs: FilterConfig[] = [
    {
      id: "accountType",
      label: "Account Type",
      options: [
        { label: "Asset", value: "ASSET" },
        { label: "Liability", value: "LIABILITY" },
        { label: "Equity", value: "EQUITY" },
        { label: "Revenue", value: "REVENUE" },
        { label: "Expense", value: "EXPENSE" },
      ],
    },
  ];

  const columns: ColumnDef<LedgerAccountDto>[] = [
    {
      accessorKey: "accountNumber",
      header: "GL Code",
      cell: ({ row }) => (
        <Link
          href={`/accounts/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.accountNumber}
        </Link>
      ),
    },
    {
      accessorKey: "name",
      header: "Account Name",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "accountType",
      header: "Account Type",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.accountType}
        </span>
      ),
    },
    {
      accessorKey: "currency",
      header: "Currency",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.currency}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Link href={`/accounts/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Ledger
          </Button>
        </Link>
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading chart of accounts..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Accounts unavailable"
        message={error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts & Ledger Master"
        description="Structure financial accounts, track debit/credit balances, and manage general ledger hierarchy."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Accounts"
          value={accounts.length}
          icon={<Landmark className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Balance Status"
          value={accounts.filter((account) => account.isActive).length}
          icon={CheckCircle2}
        />
        <StatCard
          title="Currencies"
          value={new Set(accounts.map((account) => account.currency)).size}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={accounts}
        columns={columns}
        searchPlaceholder="Search accounts by code or name..."
        filterConfigs={filterConfigs}
        loading={false}
        emptyTitle="No ledger accounts"
        emptyMessage="No chart-of-account records are available."
      />
    </div>
  );
}
