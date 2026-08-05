"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText, Plus, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  poNumber: string;
  amount: number;
  dueDate: string;
  status: "PAID" | "UNPAID" | "PARTIAL";
}

const mockInvoices: PurchaseInvoice[] = [
  {
    id: "inv-1",
    invoiceNumber: "INV-SUP-901",
    supplierName: "Global Microelectronics Co.",
    poNumber: "PO-2026-042",
    amount: 18450,
    dueDate: "2026-02-28",
    status: "UNPAID",
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-SUP-902",
    supplierName: "Precision Steel Alloys",
    poNumber: "PO-2026-059",
    amount: 12900,
    dueDate: "2026-02-15",
    status: "PAID",
  },
];

export default function PurchaseInvoicesPage() {
  const [invoices] = React.useState<PurchaseInvoice[]>(mockInvoices);

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Payment Status",
      options: [
        { label: "Unpaid", value: "UNPAID" },
        { label: "Partial", value: "PARTIAL" },
        { label: "Paid", value: "PAID" },
      ],
    },
  ];

  const columns: ColumnDef<PurchaseInvoice>[] = [
    {
      accessorKey: "invoiceNumber",
      header: "Supplier Invoice No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      accessorKey: "supplierName",
      header: "Supplier",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.supplierName}
        </span>
      ),
    },
    {
      accessorKey: "poNumber",
      header: "Ref PO",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.poNumber}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Invoice Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "PAID") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> Unpaid Due
          </span>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.dueDate)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Invoices & AP Bills"
        description="Process vendor invoices, match purchase orders to bills, and manage accounts payable schedules."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Enter Vendor Invoice
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Invoices"
          value={invoices.length}
          icon={<FileText className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Outstanding Payable"
          value={formatCurrency(
            invoices
              .filter((i) => i.status === "UNPAID")
              .reduce((acc, i) => acc + i.amount, 0),
          )}
          icon={<DollarSign className="w-4 h-4 text-amber-500" />}
        />
        <StatCard
          title="Paid Invoices"
          value={invoices.filter((i) => i.status === "PAID").length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
      </div>

      <EntityDataTable
        data={invoices}
        columns={columns}
        searchPlaceholder="Search vendor invoices by number, supplier, or PO..."
        filterConfigs={filterConfigs}
      />
    </div>
  );
}
