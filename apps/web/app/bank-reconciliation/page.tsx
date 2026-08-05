"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

interface ReconciliationStatement {
  id: string;
  statementNumber: string;
  bankAccount: string;
  statementDate: string;
  statementEndingBalance: number;
  glEndingBalance: number;
  differenceAmount: number;
  status: "MATCHED" | "UNRECONCILED";
}

const mockStatements: ReconciliationStatement[] = [
  {
    id: "rec-1",
    statementNumber: "STMT-2026-01",
    bankAccount: "HDFC Checking (•••• 9812)",
    statementDate: "2026-01-31",
    statementEndingBalance: 345000,
    glEndingBalance: 345000,
    differenceAmount: 0,
    status: "MATCHED",
  },
];

export default function BankReconciliationPage() {
  const [statements] =
    React.useState<ReconciliationStatement[]>(mockStatements);

  const columns: ColumnDef<ReconciliationStatement>[] = [
    {
      accessorKey: "statementNumber",
      header: "Statement Ref",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.statementNumber}
        </span>
      ),
    },
    {
      accessorKey: "bankAccount",
      header: "Bank Account",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.bankAccount}
        </span>
      ),
    },
    {
      accessorKey: "statementEndingBalance",
      header: "Bank Statement Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.statementEndingBalance)}
        </span>
      ),
    },
    {
      accessorKey: "glEndingBalance",
      header: "GL Ledger Balance",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.glEndingBalance)}
        </span>
      ),
    },
    {
      accessorKey: "differenceAmount",
      header: "Unmatched Variance",
      cell: ({ row }) => {
        const diff = row.original.differenceAmount;
        if (diff === 0) {
          return (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> 0.00 (Zero Diff)
            </span>
          );
        }
        return (
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> {formatCurrency(diff)}
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Statement Reconciliation Workspace"
        description="Match electronic bank statements with general ledger transactions and resolve variances."
        actions={
          <Button size="sm">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Import Bank Feed Statement
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Statements Processed"
          value={statements.length}
          icon={<RefreshCw className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Reconciliation Match"
          value="100% Balanced"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Unmatched Items"
          value="0 Line Items"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={statements}
        columns={columns}
        searchPlaceholder="Search bank reconciliation statements..."
      />
    </div>
  );
}
