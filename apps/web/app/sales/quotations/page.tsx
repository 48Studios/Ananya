"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, Plus, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCurrency, formatDate } from "@/lib/utils";

interface QuotationRecord {
  id: string;
  quoteNumber: string;
  customerName: string;
  totalAmount: number;
  validUntil: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED";
  createdDate: string;
}

const mockQuotations: QuotationRecord[] = [
  {
    id: "q-1",
    quoteNumber: "QUO-2026-901",
    customerName: "ACME Components",
    totalAmount: 52000,
    validUntil: "2026-03-01",
    status: "ACCEPTED",
    createdDate: "2026-01-25",
  },
  {
    id: "q-2",
    quoteNumber: "QUO-2026-902",
    customerName: "ACME Robotics",
    totalAmount: 24500,
    validUntil: "2026-03-15",
    status: "SENT",
    createdDate: "2026-02-02",
  },
];

export default function QuotationsPage() {
  const [quotes] = React.useState<QuotationRecord[]>(mockQuotations);

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Sent", value: "SENT" },
        { label: "Accepted", value: "ACCEPTED" },
        { label: "Rejected", value: "REJECTED" },
      ],
    },
  ];

  const columns: ColumnDef<QuotationRecord>[] = [
    {
      accessorKey: "quoteNumber",
      header: "Quote No.",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/sales/quotations/${row.original.id}`}
                    title={row.original.quoteNumber}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.quoteNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.quoteNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer Prospect",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.customerName}
        </span>
      ),
    },
    {
      accessorKey: "totalAmount",
      header: "Quoted Total",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalAmount)}
        </span>
      ),
    },
    {
      accessorKey: "validUntil",
      header: "Valid Until",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.validUntil)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
          <Link href={`/sales/quotations/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View quote details"
              aria-label="View quote details"
            >
              <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Quotations & Estimates"
        description="Draft custom price quotes, manage proposal validity dates, and convert quotes directly into sales orders."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Quotation
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Quotations"
          value={quotes.length}
          icon={<FileSpreadsheet className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Accepted Proposals"
          value={quotes.filter((q) => q.status === "ACCEPTED").length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Conversion Rate"
          value="50.0%"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={quotes}
        columns={columns}
        searchPlaceholder="Search quotes by number or customer..."
        filterConfigs={filterConfigs}
      />
    </div>
  );
}
