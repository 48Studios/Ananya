"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { RotateCcw, Plus, CheckCircle2, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate } from "@/lib/utils";

interface CustomerReturnRecord {
  id: string;
  returnNumber: string;
  customerName: string;
  reason: string;
  status: "RECEIVED" | "INSPECTED" | "CREDITED";
  returnDate: string;
}

const mockReturns: CustomerReturnRecord[] = [
  {
    id: "cret-1",
    returnNumber: "CR-2026-011",
    customerName: "ACME Components",
    reason: "Packaging damaged during transit",
    status: "INSPECTED",
    returnDate: "2026-02-02",
  },
];

export default function CustomerReturnsPage() {
  const [returns] = React.useState<CustomerReturnRecord[]>(mockReturns);

  const columns: ColumnDef<CustomerReturnRecord>[] = [
    {
      accessorKey: "returnNumber",
      header: "Return No.",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/customer-returns/${row.original.id}`}
                    title={row.original.returnNumber}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.returnNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.returnNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.customerName}
        </span>
      ),
    },
    {
      accessorKey: "reason",
      header: "Return Note",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.reason}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "returnDate",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.returnDate)}
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
          <Link href={`/customer-returns/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View return details"
              aria-label="View return details"
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
        title="Customer Returns & Credit Processing"
        description="Inspect customer returns, issue credit notes, and return inventory to stock."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Log Customer Return
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Customer Returns"
          value={returns.length}
          icon={<RotateCcw className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Inspected Units"
          value="1 Return"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Processing Time"
          value="< 24 Hours"
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={returns}
        columns={columns}
        searchPlaceholder="Search customer returns..."
      />
    </div>
  );
}
