"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

interface JournalVoucher {
  id: string;
  voucherNumber: string;
  description: string;
  debitTotal: number;
  creditTotal: number;
  createdBy: string;
  status: "POSTED" | "DRAFT";
  postingDate: string;
}

const mockVouchers: JournalVoucher[] = [
  {
    id: "jv-1",
    voucherNumber: "JV-2026-091",
    description: "Accrued Payroll Expense Allocation - Jan 2026",
    debitTotal: 45000,
    creditTotal: 45000,
    createdBy: "Finance Officer",
    status: "POSTED",
    postingDate: "2026-01-31",
  },
  {
    id: "jv-2",
    voucherNumber: "JV-2026-092",
    description: "Quarterly Equipment Depreciation Adjustment",
    debitTotal: 12500,
    creditTotal: 12500,
    createdBy: "Chief Accountant",
    status: "POSTED",
    postingDate: "2026-02-01",
  },
];

export default function JournalEntriesPage() {
  const [vouchers] = React.useState<JournalVoucher[]>(mockVouchers);

  const columns: ColumnDef<JournalVoucher>[] = [
    {
      accessorKey: "voucherNumber",
      header: "Voucher Ref",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.voucherNumber}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Journal Description",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.description}
        </span>
      ),
    },
    {
      accessorKey: "debitTotal",
      header: "DR / CR Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {formatCurrency(row.original.debitTotal)}
        </span>
      ),
    },
    {
      accessorKey: "createdBy",
      header: "Posted By",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdBy}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: () => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Posted
        </span>
      ),
    },
    {
      accessorKey: "postingDate",
      header: "Posting Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.postingDate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Journal Entries & Vouchers"
        description="Record manual journal vouchers, adjustment entries, and general ledger postings."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Journal Entry
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Posted Journal Vouchers"
          value={vouchers.length}
          icon={<FileText className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Debit / Credit Match"
          value="100% Balanced"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Audit Status"
          value="General Ledger Verified"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={vouchers}
        columns={columns}
        searchPlaceholder="Search journal vouchers by number or description..."
      />
    </div>
  );
}
