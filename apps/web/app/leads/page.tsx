"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, Plus, CheckCircle2, Clock, Eye } from "lucide-react";
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
import { formatDate } from "@/lib/utils";

interface LeadRecord {
  id: string;
  leadNumber: string;
  contactName: string;
  companyName: string;
  email: string;
  status: "NEW" | "QUALIFIED" | "CONTACTED" | "DISQUALIFIED";
  createdDate: string;
}

const mockLeads: LeadRecord[] = [
  {
    id: "ld-1",
    leadNumber: "LD-2026-01",
    contactName: "Alex Morgan",
    companyName: "ACME Robotics",
    email: "alex@example.com",
    status: "QUALIFIED",
    createdDate: "2026-02-01",
  },
  {
    id: "ld-2",
    leadNumber: "LD-2026-02",
    contactName: "Jordan Lee",
    companyName: "ACME Manufacturing",
    email: "jordan@example.com",
    status: "NEW",
    createdDate: "2026-02-03",
  },
];

export default function LeadsPage() {
  const [leads] = React.useState<LeadRecord[]>(mockLeads);

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Lead Status",
      options: [
        { label: "New", value: "NEW" },
        { label: "Contacted", value: "CONTACTED" },
        { label: "Qualified", value: "QUALIFIED" },
        { label: "Disqualified", value: "DISQUALIFIED" },
      ],
    },
  ];

  const columns: ColumnDef<LeadRecord>[] = [
    {
      accessorKey: "leadNumber",
      header: "Lead ID",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/leads/${row.original.id}`}
                    title={row.original.leadNumber}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.leadNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.leadNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "companyName",
      header: "Company / Prospect",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">
            {row.original.companyName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.contactName}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Contact Email",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.email}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "createdDate",
      header: "Date Added",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.createdDate)}
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
          <Link href={`/leads/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View lead details"
              aria-label="View lead details"
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
        title="Sales Leads & Prospects"
        description="Capture inbound leads, track contact touchpoints, and qualify prospects for sales opportunities."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Sales Lead
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Leads"
          value={leads.length}
          icon={<Users className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Qualified Prospects"
          value={leads.filter((l) => l.status === "QUALIFIED").length}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        />
        <StatCard
          title="New This Week"
          value="1 New Lead"
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
      </div>

      <EntityDataTable
        data={leads}
        columns={columns}
        searchPlaceholder="Search leads by company, contact, or ID..."
        filterConfigs={filterConfigs}
      />
    </div>
  );
}
