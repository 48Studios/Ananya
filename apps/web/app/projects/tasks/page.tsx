"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckSquare, Plus, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { tasksApi } from "@/lib/api/tasks-api";
import { projectsApi } from "@/lib/api/projects-api";
import {
  buildTaskRows,
  toProjectNameMap,
  type TaskRow,
} from "@/lib/tasks";

import { DialogShell } from "@/components/ui/dialog-shell";
import { TaskForm } from "@/components/tasks/task-form";

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchTasks = React.useCallback(() => {
    setLoading(true);
    // Project names are resolved from the projects API: a task only carries
    // `projectId`. A caller without project read access still sees the tasks.
    Promise.all([tasksApi.getAll(), projectsApi.getAll().catch(() => [])])
      .then(([rows, projects]) =>
        setTasks(buildTaskRows(rows, toProjectNameMap(projects))),
      )
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchTasks();
  };

  const columns: ColumnDef<TaskRow>[] = [
    {
      accessorKey: "taskNumber",
      header: "Task No.",
      cell: ({ row }) => (
        <span className="font-mono font-medium text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase">
          {row.original.taskNumber}
        </span>
      ),
    },
    {
      accessorKey: "title",
      header: "Task Title",
      cell: ({ row }) => (
        <span className="font-medium text-xs text-foreground">
          {row.original.title}
        </span>
      ),
    },
    {
      accessorKey: "assignedTo",
      header: "Assigned To",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.assignedTo || "Unassigned"}
        </span>
      ),
    },
    {
      accessorKey: "projectLabel",
      header: "Project",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.projectLabel || "No project name available"}
        </span>
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
          {row.original.priority || "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status || "TODO"} />,
    },
    {
      accessorKey: "actualHours",
      header: "Hours (actual / estimated)",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.actualHours} / {row.original.estimatedHours}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Task Management"
        description="Assign, track, and execute cross-departmental ERP operational tasks."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Task
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Assigned Tasks"
          value={tasks.length}
          icon={CheckSquare}
        />
        <StatCard
          title="In Progress"
          value={tasks.filter((t) => t.status === "IN_PROGRESS").length}
          icon={Clock}
        />
        <StatCard title="On-Time Completion" value="100%" icon={CheckCircle2} />
      </div>

      <EntityDataTable
        data={tasks}
        columns={columns}
        searchPlaceholder="Search operational tasks..."
        loading={loading}
        emptyTitle="No Tasks Found"
        emptyMessage="No tasks assigned to your active queue."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Create Operational Task"
        description="Assign a new operational task and tracking target."
        size="sm"
      >
        <TaskForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
