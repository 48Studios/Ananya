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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
        setError(
          err instanceof Error ? err.message : "Failed to load accounts",
        );
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
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/finance/chart-of-accounts/${row.original.id}`}
                    title={row.original.accountNumber}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.accountNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.accountNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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
      header: () => <span className="text-right block w-full">Actions</span>,
      meta: {
        width: "8%",
        headerClassName: "text-right",
        cellClassName: "text-right",
      },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/finance/chart-of-accounts/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View ledger"
              aria-label="View ledger"
            >
              <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
          </Link>
        </div>
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
