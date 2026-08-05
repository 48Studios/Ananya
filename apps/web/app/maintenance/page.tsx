"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Wrench,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Pause,
  Play,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { MaintenanceForm } from "@/components/maintenance/maintenance-form";
import {
  maintenanceApi,
  type MaintenanceScheduleDto,
} from "@/lib/api/maintenance-api";
import { formatDate } from "@/lib/utils";

export default function MaintenancePage() {
  const [schedules, setSchedules] = React.useState<MaintenanceScheduleDto[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await maintenanceApi.getAll();
      setSchedules(data || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch equipment maintenance schedules from API");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCompleteVisit = async (id: string) => {
    try {
      const updated = await maintenanceApi.completeVisit(id);
      setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setToastMessage("Maintenance service visit completed successfully.");
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage("Failed to update maintenance schedule.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleTogglePause = async (schedule: MaintenanceScheduleDto) => {
    try {
      const updated =
        schedule.status === "PAUSED"
          ? await maintenanceApi.resume(schedule.id)
          : await maintenanceApi.pause(schedule.id);
      setSchedules((prev) =>
        prev.map((s) => (s.id === schedule.id ? updated : s)),
      );
      setToastMessage(
        `Schedule ${schedule.status === "PAUSED" ? "resumed" : "paused"} successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage("Failed to update schedule status.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const columns: ColumnDef<MaintenanceScheduleDto>[] = [
    {
      accessorKey: "equipmentName",
      header: "Equipment Asset",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-xs text-primary">
            {row.original.equipmentName || "Asset"}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {row.original.workCenterCode || "-"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "taskType",
      header: "Maintenance Task",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.taskType || "PREVENTIVE"}
        </span>
      ),
    },
    {
      accessorKey: "lastCompletedDate",
      header: "Last Service",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.lastCompletedDate
            ? formatDate(row.original.lastCompletedDate)
            : "-"}
        </span>
      ),
    },
    {
      accessorKey: "nextDueDate",
      header: "Next Service Due",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.nextDueDate
            ? formatDate(row.original.nextDueDate)
            : "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <Clock className="w-3 h-3 mr-1" />{" "}
          {row.original.status || "SCHEDULED"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Complete Visit"
            onClick={() => handleCompleteVisit(row.original.id)}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 hover:text-emerald-700" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title={
              row.original.status === "PAUSED"
                ? "Resume Schedule"
                : "Pause Schedule"
            }
            onClick={() => handleTogglePause(row.original)}
          >
            {row.original.status === "PAUSED" ? (
              <Play className="w-3.5 h-3.5 text-blue-600" />
            ) : (
              <Pause className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Scheduled", value: "SCHEDULED" },
        { label: "Completed", value: "COMPLETED" },
        { label: "Paused", value: "PAUSED" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipment Preventive Maintenance"
        description="Schedule machine calibration, preventive maintenance runs, and equipment inspection logs."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Schedule Maintenance Work
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Equipment Assets Tracked"
          value={schedules.length}
          subtitle="Monitored machine shop units"
          icon={Wrench}
        />
        <StatCard
          title="Scheduled Tasks"
          value={schedules.filter((s) => s?.status === "SCHEDULED").length}
          subtitle="Upcoming preventive visits"
          icon={Clock}
        />
        <StatCard
          title="Completed Runs"
          value={schedules.filter((s) => s?.status === "COMPLETED").length}
          subtitle="Verified calibration logs"
          icon={CheckCircle2}
        />
      </div>

      {toastMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={fetchData}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      <EntityDataTable
        data={schedules}
        columns={columns}
        searchPlaceholder="Search maintenance tasks by asset, work center, or status..."
        loading={loading}
        filterConfigs={filterConfigs}
        emptyTitle="No Maintenance Schedules Found"
        emptyMessage="No equipment maintenance schedules match your query."
        actionButton={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Schedule Maintenance Work
          </Button>
        }
      />

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">
                Schedule Equipment Maintenance
              </h3>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setIsFormOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <MaintenanceForm
              onSuccess={(created) => {
                setSchedules((prev) => [created, ...prev]);
                setIsFormOpen(false);
                setToastMessage(
                  "New equipment maintenance task scheduled cleanly.",
                );
                setTimeout(() => setToastMessage(null), 4000);
              }}
              onCancel={() => setIsFormOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
