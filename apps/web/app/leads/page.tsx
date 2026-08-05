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
    contactName: "Sarah Jenkins",
    companyName: "Nexus Defense Industries",
    email: "s.jenkins@nexusdefense.com",
    status: "QUALIFIED",
    createdDate: "2026-02-01",
  },
  {
    id: "ld-2",
    leadNumber: "LD-2026-02",
    contactName: "David Chen",
    companyName: "Precision Robotics Lab",
    email: "d.chen@precisionrobotics.io",
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
      cell: ({ row }) => (
        <Link
          href={`/leads/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.leadNumber}
        </Link>
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
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "QUALIFIED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Qualified
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> {s}
          </span>
        );
      },
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
      header: "Actions",
      cell: ({ row }) => (
        <Link href={`/leads/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Lead
          </Button>
        </Link>
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
