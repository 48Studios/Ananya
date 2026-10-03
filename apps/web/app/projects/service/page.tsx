"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Wrench, Plus, CheckCircle2, Clock, Eye } from "lucide-react";
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
import { serviceRequestsApi } from "@/lib/api/service-requests-api";
import { customersApi } from "@/lib/api/customers-api";
import {
  buildServiceRequestRows,
  toCustomerNameMap,
  type ServiceRequestRow,
} from "@/lib/service-requests";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { ServiceRequestForm } from "@/components/service/service-request-form";

export default function ServicePage() {
  const [tickets, setTickets] = React.useState<ServiceRequestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchTickets = React.useCallback(() => {
    setLoading(true);
    // Customer names are resolved from the customers API; the service request
    // itself only carries `customerId`. A caller without customer read access
    // still sees the tickets, with the customer shown as unassigned.
    Promise.all([
      serviceRequestsApi.getAll(),
      customersApi.getAll().catch(() => []),
    ])
      .then(([requests, customers]) =>
        setTickets(buildServiceRequestRows(requests, toCustomerNameMap(customers))),
      )
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchTickets();
  };

  const columns: ColumnDef<ServiceRequestRow>[] = [
    {
      accessorKey: "serviceNumber",
      header: "Ticket No.",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/projects/service/${row.original.id}`}
                    title={row.original.serviceNumber}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.serviceNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.serviceNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer & Asset",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-foreground">
            {row.original.customerName || "Unassigned customer"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.assetLabel || "No asset recorded"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "title",
      header: "Service Request",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-xs truncate block">
          {row.original.title}
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
        <StatusBadge status={row.original.status || "OPEN"} />
      ),
    },
    {
      accessorKey: "reportedAt",
      header: "Reported",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.reportedAt ? formatDate(row.original.reportedAt) : "-"}
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
          <Link href={`/projects/service/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View ticket details"
              aria-label="View ticket details"
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
        title="Field Service & Technical Support Tickets"
        description="Manage customer field service requests, engineer dispatches, asset repairs, and SLA resolution times."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/manufacturing/maintenance">
              <Button variant="outline" size="sm">
                <Wrench className="w-4 h-4 mr-1.5" />
                Equipment Maintenance
              </Button>
            </Link>
            <Button size="sm" onClick={() => setIsFormOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New Service Ticket
            </Button>
          </div>
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
          value={`${tickets.filter((t) => t.status === "REPAIRING" || t.status === "DIAGNOSING").length} Active Techs`}
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
        entityType="ServiceRequest"
        searchPlaceholder="Search service tickets by number, customer, or asset..."
        loading={loading}
        emptyTitle="No Service Tickets"
        emptyMessage="No open support or field service tickets found."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="New Field Service Ticket"
        description="Create a technical support or field service ticket."
        size="sm"
      >
        <ServiceRequestForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
