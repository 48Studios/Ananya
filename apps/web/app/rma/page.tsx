"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RotateCcw, Plus, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { rmaRequestsApi, type RmaRequestDto } from "@/lib/api/rma-requests-api";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { RmaRequestForm } from "@/components/rma/rma-request-form";

export default function RmaPage() {
  const [requests, setRequests] = React.useState<RmaRequestDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchRequests = React.useCallback(() => {
    setLoading(true);
    rmaRequestsApi
      .getAll()
      .then((data) => setRequests(data || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchRequests();
  };

  const columns: ColumnDef<RmaRequestDto>[] = [
    {
      accessorKey: "rmaNumber",
      header: "RMA Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.rmaNumber || "-"}
        </span>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer & Order",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-xs text-foreground">
            {row.original.customerName || "Customer"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {row.original.salesOrderNumber || "-"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "reason",
      header: "Return Reason",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.reason || "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" />{" "}
          {row.original.status || "SUBMITTED"}
        </span>
      ),
    },
    {
      accessorKey: "createdDate",
      header: "Created Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdDate
            ? formatDate(row.original.createdDate)
            : "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Return Merchandise Authorization (RMA)"
        description="Manage customer returns, inspection dispositioning, credit memos, and restocking."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Issue New RMA
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active RMA Requests"
          value={requests.length}
          icon={RotateCcw}
        />
        <StatCard
          title="Received & Inspected"
          value={requests.filter((r) => r?.status === "INSPECTED").length}
          icon={CheckCircle2}
        />
        <StatCard title="Turnaround Time" value="< 48 Hours" icon={Clock} />
      </div>

      <EntityDataTable
        data={requests}
        columns={columns}
        searchPlaceholder="Search RMA requests by number, customer, or sales order..."
        loading={loading}
        emptyTitle="No RMA Requests"
        emptyMessage="No active Return Merchandise Authorizations."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Issue Return Merchandise Authorization"
        description="Create a new customer Return Merchandise Authorization (RMA)."
        size="sm"
      >
        <RmaRequestForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
