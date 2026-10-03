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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { MaintenanceForm } from "@/components/maintenance/maintenance-form";
import { maintenanceApi } from "@/lib/api/maintenance-api";
import { customersApi } from "@/lib/api/customers-api";
import { toCustomerNameMap } from "@/lib/service-requests";
import {
  buildMaintenanceRows,
  FREQUENCY_LABELS,
  type MaintenanceRow,
} from "@/lib/maintenance";
import { formatDate } from "@/lib/utils";

export default function MaintenancePage() {
  const [schedules, setSchedules] = React.useState<MaintenanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // A schedule carries `customerId`; the customer name is resolved from the
      // customers API so a caller without that read access still sees the plan.
      const [data, customers] = await Promise.all([
        maintenanceApi.getAll(),
        customersApi.getAll().catch(() => []),
      ]);
      setSchedules(buildMaintenanceRows(data, toCustomerNameMap(customers)));
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
      await maintenanceApi.completeVisit(id);
      await fetchData();
      setToastMessage("Maintenance service visit completed successfully.");
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage("Failed to update maintenance schedule.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleTogglePause = async (schedule: MaintenanceRow) => {
    try {
      if (schedule.status === "PAUSED") {
        await maintenanceApi.resume(schedule.id);
      } else {
        await maintenanceApi.pause(schedule.id);
      }
      await fetchData();
      setToastMessage(
        `Schedule ${schedule.status === "PAUSED" ? "resumed" : "paused"} successfully.`,
      );
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage("Failed to update schedule status.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const columns: ColumnDef<MaintenanceRow>[] = [
    {
      accessorKey: "scheduleNumber",
      header: "Schedule No.",
      cell: ({ row }) => (
        <span className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase">
          {row.original.scheduleNumber}
        </span>
      ),
    },
    {
      accessorKey: "assetLabel",
      header: "Equipment Asset",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-xs text-foreground">
            {row.original.assetLabel}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {row.original.assetSubLabel || "No serial recorded"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.customerName || "Unassigned customer"}
        </span>
      ),
    },
    {
      accessorKey: "frequency",
      header: "Service Frequency",
      cell: ({ row }) => (
        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {FREQUENCY_LABELS[row.original.frequency] ?? row.original.frequency}
        </span>
      ),
    },
    {
      accessorKey: "assignedTechnician",
      header: "Technician",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.assignedTechnician || "Unassigned"}
        </span>
      ),
    },
    {
      accessorKey: "nextVisitDate",
      header: "Next Visit Due",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.nextVisitDate
            ? formatDate(row.original.nextVisitDate)
            : "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status || "ACTIVE"} />,
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
          <Button
            variant="ghost"
            size="icon-xs"
            title="Complete Visit"
            aria-label="Complete Visit"
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
            aria-label={
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
          value={schedules.filter((s) => s.status === "ACTIVE").length}
          subtitle="Active preventive visit plans"
          icon={Clock}
        />
        <StatCard
          title="Completed Runs"
          value={schedules.filter((s) => s.status === "COMPLETED").length}
          subtitle="Verified calibration logs"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        notice={
          <>
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
          </>
        }
        data={schedules}
        columns={columns}
        entityType="MaintenanceSchedule"
        searchPlaceholder="Search maintenance tasks by asset, work center, or status..."
        loading={loading}
        filterConfigs={filterConfigs}
        emptyTitle="No Maintenance Schedules Found"
        emptyMessage="No equipment maintenance schedules match your query."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Schedule Equipment Maintenance"
        description="Plan the next preventive, calibration, or overhaul visit for a tracked equipment asset."
        size="sm"
      >
        <MaintenanceForm
          onSuccess={() => {
            // Re-read through the same mapper so the new row carries its
            // resolved customer label instead of a raw id.
            void fetchData();
            setIsFormOpen(false);
            setToastMessage(
              "New equipment maintenance task scheduled cleanly.",
            );
            setTimeout(() => setToastMessage(null), 4000);
          }}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
