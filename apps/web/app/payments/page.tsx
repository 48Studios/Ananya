"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DollarSign, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PaymentVoucher {
  id: string;
  paymentNumber: string;
  partyName: string;
  type: "RECEIPT" | "PAYMENT";
  amount: number;
  method: "BANK_TRANSFER" | "CHECK" | "WIRE";
  paymentDate: string;
}

const mockPayments: PaymentVoucher[] = [
  {
    id: "pay-1",
    paymentNumber: "PAY-2026-101",
    partyName: "AeroTech Systems",
    type: "RECEIPT",
    amount: 48500,
    method: "WIRE",
    paymentDate: "2026-02-04",
  },
  {
    id: "pay-2",
    paymentNumber: "PAY-2026-102",
    partyName: "Precision Steel Alloys",
    type: "PAYMENT",
    amount: 12900,
    method: "BANK_TRANSFER",
    paymentDate: "2026-02-02",
  },
];

export default function PaymentsPage() {
  const [payments] = React.useState<PaymentVoucher[]>(mockPayments);

  const columns: ColumnDef<PaymentVoucher>[] = [
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
      accessorKey: "partyName",
      header: "Customer / Supplier Party",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.partyName}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: "Voucher Type",
      cell: ({ row }) => {
        const isReceipt = row.original.type === "RECEIPT";
        return (
          <span
            className={`font-mono text-xs px-2 py-0.5 rounded font-semibold border ${
              isReceipt
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
            }`}
          >
            {isReceipt ? "Customer Receipt" : "Vendor Payment"}
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
      accessorKey: "method",
      header: "Payment Method",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.method}
        </span>
      ),
    },
    {
      accessorKey: "paymentDate",
      header: "Payment Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.paymentDate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Customer Cash Receipts"
        description="Record incoming customer receipts, vendor disbursements, and bank wire transfers."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Record Payment Voucher
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Transactions Logged"
          value={payments.length}
          icon={<DollarSign className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Customer Cash Receipts"
          value={formatCurrency(48500)}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Vendor Disbursements"
          value={formatCurrency(12900)}
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={payments}
        columns={columns}
        searchPlaceholder="Search payments by voucher # or party..."
      />
    </div>
  );
}
