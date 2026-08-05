"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Factory, Plus, Play, Wrench, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { workOrdersApi, type WorkOrderDto } from "@/lib/api/work-orders-api";
import { bomsApi, type BillOfMaterialsDto } from "@/lib/api/boms-api";

export default function ManufacturingPage() {
  const [workOrders, setWorkOrders] = React.useState<WorkOrderDto[]>([]);
  const [boms, setBoms] = React.useState<BillOfMaterialsDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      workOrdersApi.getAll().catch(() => []),
      bomsApi.getAll().catch(() => []),
    ])
      .then(([woData, bomData]) => {
        setWorkOrders(woData);
        setBoms(bomData);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeWorkOrdersCount = React.useMemo(() => {
    return workOrders.filter(
      (w) => w.status === "IN_PROGRESS" || w.status === "RELEASED",
    ).length;
  }, [workOrders]);

  const columns: ColumnDef<WorkOrderDto>[] = [
    {
      accessorKey: "productionNumber",
      header: "Work Order No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.productionNumber}
        </span>
      ),
    },
    {
      accessorKey: "quantityPlanned",
      header: "Target Qty",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.quantityPlanned} units
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Manufacturing Status",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Play className="w-3 h-3 mr-1" /> {row.original.status}
        </span>
      ),
    },
    {
      accessorKey: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.startDate || "Scheduled"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manufacturing & Shop Floor Execution"
        description="Monitor active production runs, work order routing, bills of materials, and shop floor work centers."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Work Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Production Orders"
          value={activeWorkOrdersCount}
          icon={Factory}
        />
        <StatCard
          title="Active Bills of Materials"
          value={boms.length}
          icon={FileCode2}
        />
        <StatCard
          title="Work Centers Online"
          value="4 / 4 Operating"
          icon={Wrench}
        />
      </div>

      <EntityDataTable
        data={workOrders}
        columns={columns}
        searchPlaceholder="Search work orders by number or status..."
        loading={loading}
      />
    </div>
  );
}
