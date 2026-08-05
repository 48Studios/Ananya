"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Wrench, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { mrpApi, type WorkCenterCapacityDto } from "@/lib/api/mrp-api";

export default function MrpCapacityPage() {
  const [centers, setCenters] = React.useState<WorkCenterCapacityDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    mrpApi
      .getCapacityPlans()
      .then((data) => setCenters(data || []))
      .catch(() => setCenters([]))
      .finally(() => setLoading(false));
  }, []);

  const averageUtilization = React.useMemo(() => {
    if (!centers.length) return "0%";
    const sum = centers.reduce(
      (acc, c) => acc + (c?.utilizationPercentage || 0),
      0,
    );
    return `${(sum / centers.length).toFixed(1)}%`;
  }, [centers]);

  const columns: ColumnDef<WorkCenterCapacityDto>[] = [
    {
      accessorKey: "workCenterCode",
      header: "Work Center ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.workCenterCode || "-"}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: "Work Center Name",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.name || "-"}
        </span>
      ),
    },
    {
      accessorKey: "availableHoursWeekly",
      header: "Capacity (Hrs/Wk)",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.availableHoursWeekly || 0} hrs
        </span>
      ),
    },
    {
      accessorKey: "allocatedHoursWeekly",
      header: "Scheduled Load",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-semibold">
          {row.original.allocatedHoursWeekly || 0} hrs
        </span>
      ),
    },
    {
      accessorKey: "utilizationPercentage",
      header: "Capacity Utilization",
      cell: ({ row }) => {
        const util = row.original.utilizationPercentage || 0;
        if (util > 90) {
          return (
            <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {util}% (Near
              Bottleneck)
            </span>
          );
        }
        return (
          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {util}% (Optimal)
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="MRP Work Center Capacity Loading"
        description="Monitor machine shop capacity, labor constraints, and work center utilization loading."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Work Centers" value={centers.length} icon={Wrench} />
        <StatCard
          title="Average Utilization"
          value={averageUtilization}
          icon={CheckCircle2}
        />
        <StatCard
          title="Bottlenecks"
          value={`${centers.filter((c) => (c?.utilizationPercentage || 0) > 90).length} High Load`}
          icon={AlertTriangle}
        />
      </div>

      <EntityDataTable
        data={centers}
        columns={columns}
        searchPlaceholder="Search work centers..."
        loading={loading}
        emptyTitle="No Capacity Plans Found"
        emptyMessage="No work center capacity loads match your filter."
      />
    </div>
  );
}
