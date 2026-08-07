"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Wrench, Plus, CheckCircle2, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import {
  serviceRequestsApi,
  type ServiceRequestDto,
} from "@/lib/api/service-requests-api";
import { formatDate } from "@/lib/utils";

export default function ServicePage() {
  const [tickets, setTickets] = React.useState<ServiceRequestDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    serviceRequestsApi
      .getAll()
      .then((data) => setTickets(data || []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnDef<ServiceRequestDto>[] = [
    {
      accessorKey: "ticketNumber",
      header: "Ticket No.",
      cell: ({ row }) => (
        <Link
          href={`/service/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.ticketNumber || "-"}
        </Link>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer & Asset",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">
            {row.original.customerName || "Customer"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.assetName || "-"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "issueSubject",
      header: "Service Request",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-xs truncate block">
          {row.original.issueSubject || "-"}
        </span>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
          {row.original.priority || "NORMAL"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" /> {row.original.status || "OPEN"}
        </span>
      ),
    },
    {
      accessorKey: "createdDate",
      header: "Reported",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdDate
            ? formatDate(row.original.createdDate)
            : "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Link href={`/service/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Ticket
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field Service & Technical Support Tickets"
        description="Manage customer field service requests, engineer dispatches, asset repairs, and SLA resolution times."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Service Ticket
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Open Service Tickets"
          value={tickets.length}
          icon={Wrench}
        />
        <StatCard
          title="Dispatched Engineers"
          value={`${tickets.filter((t) => t?.status === "IN_PROGRESS").length} Active Techs`}
          icon={Clock}
        />
        <StatCard
          title="SLA Compliance"
          value="100% On Time"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={tickets}
        columns={columns}
        searchPlaceholder="Search service tickets by number, customer, or asset..."
        loading={loading}
        emptyTitle="No Service Tickets"
        emptyMessage="No open support or field service tickets found."
      />
    </div>
  );
}
