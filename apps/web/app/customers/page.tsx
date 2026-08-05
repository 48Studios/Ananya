"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, CheckCircle2, Eye, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";

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
    name: "AeroTech Systems Inc.",
    contactEmail: "procurement@aerotech.com",
    phone: "+1 (555) 019-2831",
    city: "Seattle, WA",
    status: "ACTIVE",
  },
  {
    id: "cust-2",
    code: "CUST-002",
    name: "Starlight Robotics LLC",
    contactEmail: "orders@starlightrobotics.io",
    phone: "+1 (555) 014-9920",
    city: "Austin, TX",
    status: "ACTIVE",
  },
  {
    id: "cust-3",
    code: "CUST-003",
    name: "NexGen Automation Corp",
    contactEmail: "supply@nexgenauto.com",
    phone: "+1 (555) 017-4819",
    city: "Chicago, IL",
    status: "ACTIVE",
  },
];

export default function CustomersPage() {
  const [customers] = React.useState<CustomerRecord[]>(mockCustomers);

  const columns: ColumnDef<CustomerRecord>[] = [
    {
      accessorKey: "code",
      header: "Customer Code",
      cell: ({ row }) => (
        <Link
          href={`/customers/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: "name",
      header: "Company Account",
      cell: ({ row }) => (
        <span className="font-semibold text-xs text-foreground">
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
      cell: () => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Active Account
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Link href={`/customers/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Profile
          </Button>
        </Link>
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
        data={customers}
        columns={columns}
        searchPlaceholder="Search customer accounts by code, name, or city..."
      />
    </div>
  );
}
