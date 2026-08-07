"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Play, CheckCircle2, Eye, Loader2, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { mrpApi, type MrpRunRecordDto } from "@/lib/api/mrp-api";
import { formatDate } from "@/lib/utils";

export default function MrpRunsPage() {
  const [runs, setRuns] = React.useState<MrpRunRecordDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [banner, setBanner] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

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
        message: err instanceof Error ? err.message : "Failed to execute MRP run",
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
      cell: ({ row }) => (
        <Link
          href={`/mrp/runs/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.runNumber || "-"}
        </Link>
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
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />{" "}
          {row.original.status || "COMPLETED"}
        </span>
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
      header: "Actions",
      cell: ({ row }) => (
        <Link href={`/mrp/runs/${row.original.id}`}>
          <Button variant="ghost" size="xs">
            <Eye className="w-3.5 h-3.5 mr-1" /> View Log
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`p-3 text-xs border rounded-md ${
            banner.type === "error"
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {banner.message}
        </div>
      )}

      <PageHeader
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
