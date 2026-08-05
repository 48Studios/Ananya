"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { RotateCcw, Plus, CheckCircle2, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
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
    customerName: "AeroTech Systems",
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
      cell: ({ row }) => (
        <Link
          href={`/customer-returns/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.returnNumber}
        </Link>
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
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" /> {row.original.status}
        </span>
      ),
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
      header: "Actions",
      cell: ({ row }) => (
        <Link href={`/customer-returns/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> Details
          </Button>
        </Link>
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
