"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Factory, Plus, Play, Wrench, FileCode2 } from "lucide-react";
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
import { workOrdersApi, type WorkOrderDto } from "@/lib/api/work-orders-api";
import { bomsApi, type BillOfMaterialsDto } from "@/lib/api/boms-api";
import { formatDate } from "@/lib/utils";

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
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/work-orders/${row.original.id}`}
                    className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.productionNumber}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.productionNumber}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.startDate ? formatDate(row.original.startDate) : "Scheduled"}
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
        entityType="WorkOrder"
        searchPlaceholder="Search work orders by number or status..."
        loading={loading}
      />
    </div>
  );
}
