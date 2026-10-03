"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Play, CheckCircle2, Eye, Loader2, Clock3 } from "lucide-react";
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
import { mrpApi, type MrpRunRecordDto } from "@/lib/api/mrp-api";
import { formatDate } from "@/lib/utils";

export default function MrpRunsPage() {
  const [runs, setRuns] = React.useState<MrpRunRecordDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [banner, setBanner] = React.useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fetchRuns = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await mrpApi.getRuns();
      setRuns(data || []);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleExecuteRun = async () => {
    setRunning(true);
    try {
      const newRun = await mrpApi.executeRun();
      setBanner({
        message: `Executed new MRP run "${newRun.runNumber}".`,
        type: "success",
      });
      fetchRuns();
    } catch (err: unknown) {
      setBanner({
        message:
          err instanceof Error ? err.message : "Failed to execute MRP run",
        type: "error",
      });
    } finally {
      setRunning(false);
      setTimeout(() => setBanner(null), 5000);
    }
  };

  const completedCount = React.useMemo(
    () => runs.filter((r) => r?.status === "COMPLETED").length,
    [runs],
  );

  const columns: ColumnDef<MrpRunRecordDto>[] = [
    {
      accessorKey: "runNumber",
      header: "MRP Run No.",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/manufacturing/mrp/runs/${row.original.id}`}
                    title={row.original.runNumber || "-"}
                    className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.runNumber || "-"}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.runNumber || "-"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "startedBy",
      header: "Triggered By",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.startedBy || "System"}
        </span>
      ),
    },
    {
      accessorKey: "horizonDays",
      header: "Planning Horizon",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground">
          {row.original.horizonDays || 0} days
        </span>
      ),
    },
    {
      accessorKey: "completedAt",
      header: "Completed At",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.completedAt
            ? formatDate(row.original.completedAt)
            : "Pending"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status || "COMPLETED"} />
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Run Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdAt ? formatDate(row.original.createdAt) : "-"}
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
          <Link href={`/manufacturing/mrp/runs/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View execution log"
              aria-label="View execution log"
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
        backHref="/manufacturing/mrp"
        backLabel="Back to MRP"
        title="MRP Execution History & Logs"
        description="Review historical material requirements planning calculation runs, log traces, and planned order outputs."
        actions={
          <Button size="sm" onClick={handleExecuteRun} disabled={running}>
            {running ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-1.5" />
            )}
            Execute New MRP Run
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total MRP Runs" value={runs.length} icon={Play} />
        <StatCard
          title="Completed Runs"
          value={completedCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Active Runs"
          value={runs.filter((run) => run.status === "IN_PROGRESS").length}
          icon={Clock3}
        />
      </div>

      <EntityDataTable
        notice={
          banner && (
            <div
              className={`p-3 text-xs border rounded-md ${
                banner.type === "error"
                  ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {banner.message}
            </div>
          )
        }
        data={runs}
        columns={columns}
        searchPlaceholder="Search MRP runs..."
        loading={loading}
        emptyTitle="No MRP Runs Recorded"
        emptyMessage="Click 'Execute New MRP Run' to trigger a calculation run."
      />
    </div>
  );
}
