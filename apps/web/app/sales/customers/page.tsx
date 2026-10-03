"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, CheckCircle2, Eye, Building } from "lucide-react";
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

interface CustomerRecord {
  id: string;
  code: string;
  name: string;
  contactEmail: string;
  phone: string;
  city: string;
  status: "ACTIVE" | "INACTIVE";
}

const mockCustomers: CustomerRecord[] = [
  {
    id: "cust-1",
    code: "CUST-001",
    name: "ACME Components Inc.",
    contactEmail: "procurement@example.com",
    phone: "+1 202-555-0101",
    city: "Example City",
    status: "ACTIVE",
  },
  {
    id: "cust-2",
    code: "CUST-002",
    name: "ACME Robotics LLC",
    contactEmail: "orders@example.com",
    phone: "+1 202-555-0102",
    city: "Example City",
    status: "ACTIVE",
  },
  {
    id: "cust-3",
    code: "CUST-003",
    name: "ACME Automation Corp.",
    contactEmail: "supply@example.com",
    phone: "+1 202-555-0103",
    city: "Example City",
    status: "ACTIVE",
  },
];

export default function CustomersPage() {
  const [customers] = React.useState<CustomerRecord[]>(mockCustomers);

  const columns: ColumnDef<CustomerRecord>[] = [
    {
      accessorKey: "code",
      header: "Customer Code",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/sales/customers/${row.original.id}`}
                    title={row.original.code}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.code}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.code}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Company Account",
      cell: ({ row }) => (
        <span className="font-medium text-xs text-foreground">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: "contactEmail",
      header: "Contact Email",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.contactEmail}
        </span>
      ),
    },
    {
      accessorKey: "city",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.city}
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
          <Link href={`/sales/customers/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View profile"
              aria-label="View profile"
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
        title="Customer Account Directory"
        description="Manage customer enterprise accounts, credit limits, primary contacts, and order histories."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Customer Account
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Customer Accounts"
          value={customers.length}
          icon={<Building className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Account Status"
          value="100% Active"
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="Credit Status"
          value="Good Standing"
          icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        entityType="Customer"
        data={customers}
        columns={columns}
        searchPlaceholder="Search customer accounts by code, name, or city..."
      />
    </div>
  );
}
