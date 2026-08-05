"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Landmark, TrendingUp, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { formatCurrency } from "@/lib/utils";

interface FinanceSummaryCategory {
  id: string;
  accountCategory: string;
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  totalBalance: number;
  activeAccountsCount: number;
}

const mockFinanceCategories: FinanceSummaryCategory[] = [
  {
    id: "f-1",
    accountCategory: "Current Cash & Bank Reserves",
    accountType: "ASSET",
    totalBalance: 485000,
    activeAccountsCount: 4,
  },
  {
    id: "f-2",
    accountCategory: "Accounts Receivable (Customer Balances)",
    accountType: "ASSET",
    totalBalance: 124500,
    activeAccountsCount: 12,
  },
  {
    id: "f-3",
    accountCategory: "Accounts Payable (Vendor Liabilities)",
    accountType: "LIABILITY",
    totalBalance: 68400,
    activeAccountsCount: 8,
  },
  {
    id: "f-4",
    accountCategory: "Operating Revenue YTD",
    accountType: "REVENUE",
    totalBalance: 890000,
    activeAccountsCount: 5,
  },
];

export default function FinancePage() {
  const [categories] = React.useState<FinanceSummaryCategory[]>(
    mockFinanceCategories,
  );

  const columns: ColumnDef<FinanceSummaryCategory>[] = [
    {
      accessorKey: "accountCategory",
      header: "GL Category",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-primary">
          {row.original.accountCategory}
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
      accessorKey: "totalBalance",
      header: "Category Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.totalBalance)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & General Ledger Executive Hub"
        description="Monitor general ledger accounts, trial balances, cash flow reserves, accounts payable/receivable, and financial reporting."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Cash & Reserves"
          value={formatCurrency(485000)}
          icon={<Landmark className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="YTD Revenue"
          value={formatCurrency(890000)}
          icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Ledger Integrity"
          value="100% Reconciled"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={categories}
        columns={columns}
        searchPlaceholder="Search finance categories..."
      />
    </div>
  );
}
