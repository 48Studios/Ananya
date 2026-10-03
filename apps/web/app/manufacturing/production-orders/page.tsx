"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Factory, Plus, CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { workOrdersApi, type WorkOrderDto } from "@/lib/api/work-orders-api";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { WorkOrderForm } from "@/components/work-orders/work-order-form";

export default function ProductionOrdersPage() {
  const [orders, setOrders] = React.useState<WorkOrderDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchOrders = React.useCallback(() => {
    setLoading(true);
    workOrdersApi
      .getAll()
      .then((data) => setOrders(data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    fetchOrders();
  };

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Production Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Released", value: "RELEASED" },
        { label: "In Progress", value: "IN_PROGRESS" },
        { label: "Completed", value: "COMPLETED" },
      ],
    },
  ];

  const columns: ColumnDef<WorkOrderDto>[] = [
    {
      accessorKey: "productionNumber",
      header: "Production Order No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase font-bold inline-block truncate max-w-full align-middle">
          {row.original.productionNumber}
        </span>
      ),
    },
    {
      accessorKey: "quantityPlanned",
      header: "Target Qty",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-semibold">
          {row.original.quantityPlanned} units
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "endDate",
      header: "Due Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.endDate ? formatDate(row.original.endDate) : "Unscheduled"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Orders & Scheduling"
        description="Release production orders to shop floor work centers, allocate components, and track yield output."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Release New Production Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Production Orders"
          value={orders.length}
          icon={Factory}
        />
        <StatCard
          title="In Assembly"
          value={orders.filter((o) => o.status === "IN_PROGRESS").length}
          icon={Play}
        />
        <StatCard
          title="Completed"
          value={orders.filter((o) => o.status === "COMPLETED").length}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={orders}
        columns={columns}
        entityType="WorkOrder"
        searchPlaceholder="Search production orders by number or status..."
        filters={filterConfigs}
        loading={loading}
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Create Production Order"
        description="Schedule manufacturing production runs, BOM allocations, and shop-floor work orders."
        size="md"
      >
        <WorkOrderForm
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
