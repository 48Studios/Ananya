"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { tasksApi } from "@/lib/api/tasks-api";
import { projectsApi } from "@/lib/api/projects-api";
import { toProjectNameMap, toTaskRow, type TaskRow } from "@/lib/tasks";

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params?.id as string;

  const [task, setTask] = React.useState<TaskRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!taskId) return;
    Promise.all([
      tasksApi.getById(taskId),
      projectsApi.getAll().catch(() => []),
    ])
      .then(([row, projects]) =>
        setTask(toTaskRow(row, toProjectNameMap(projects))),
      )
      .catch(() => setTask(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading task details...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      <PageHeader
        backHref="/projects/tasks"
        backLabel="Back to Tasks"
        title={`Task ${task?.taskNumber ?? taskId ?? ""}`.trim()}
        description="Inspect operational task details, assignment, and completion checklist."
        actions={
          <Button size="sm">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Mark Task Complete
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Task Title</p>
          <p className="text-sm font-semibold text-foreground">
            {task?.title || "Untitled task"}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Assignee</p>
          <p className="text-sm font-semibold text-foreground">
            {task?.assignedTo || "Unassigned"}
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl space-y-1">
          <p className="text-xs text-muted-foreground">Project</p>
          <span className="font-mono text-xs text-primary font-bold">
            {task?.projectLabel || "No project name available"}
          </span>
        </div>
      </div>
    </div>
  );
}
