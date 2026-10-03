"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { timeEntriesApi } from "@/lib/api/time-entries-api";
import { tasksApi } from "@/lib/api/tasks-api";
import { usersApi } from "@/lib/api/users-api";
import {
  buildTimeEntryRows,
  sumLoggedHours,
  toTaskTitleMap,
  toUserLabelMap,
  type TimeEntryRow,
} from "@/lib/time-entries";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { TimeEntryForm } from "@/components/time/time-entry-form";

export default function TimePage() {
  const [logs, setLogs] = React.useState<TimeEntryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchLogs = React.useCallback(() => {
    setLoading(true);
    // A time entry carries `userId` and `taskId`; the employee and task labels
    // are resolved from their own APIs. A caller without those read
    // permissions still sees the timesheet.
    Promise.all([
      timeEntriesApi.getAll(),
      usersApi.getAll().catch(() => []),
      tasksApi.getAll().catch(() => []),
    ])
      .then(([entries, users, tasks]) =>
        setLogs(
          buildTimeEntryRows(entries, {
            userNames: toUserLabelMap(users),
            taskTitles: toTaskTitleMap(tasks),
          }),
        ),
      )
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchLogs();
  };

  const totalHours = React.useMemo(() => sumLoggedHours(logs), [logs]);

  const columns: ColumnDef<TimeEntryRow>[] = [
    {
      accessorKey: "employeeLabel",
      header: "Employee",
      cell: ({ row }) => (
        <span className="font-medium text-xs text-foreground">
          {row.original.employeeLabel || "Unknown employee"}
        </span>
      ),
    },
    {
      accessorKey: "taskLabel",
      header: "Task",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-0.5 rounded font-bold">
          {row.original.taskLabel || "Unknown task"}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Work Completed",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.description || "-"}
        </span>
      ),
    },
    {
      accessorKey: "hours",
      header: "Logged Hours",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.hours} hrs
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.status || "-"}
        </span>
      ),
    },
    {
      accessorKey: "workDate",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.workDate ? formatDate(row.original.workDate) : "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Time Tracking & Labor Logs"
        description="Log labor hours against work orders, field service tickets, and shop floor operations."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Log Hours
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Hours Logged Today"
          value={`${totalHours} hrs`}
          icon={Clock}
        />
        <StatCard
          title="Active Timesheets"
          value={logs.length}
          icon={CheckCircle2}
        />
        <StatCard
          title="Labor Utilization"
          value="100% Direct Labor"
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={logs}
        columns={columns}
        searchPlaceholder="Search labor logs by employee or order..."
        loading={loading}
        emptyTitle="No Timesheets Found"
        emptyMessage="No time tracking records currently logged."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Log Labor Hours"
        description="Record labor time spent on operations or tasks."
        size="sm"
      >
        <TimeEntryForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
