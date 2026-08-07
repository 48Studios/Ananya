"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  FolderKanban,
  Pencil,
  AlertCircle,
  RefreshCw,
  Play,
  Pause,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ProjectForm } from "@/components/projects/project-form";
import {
  projectsApi,
  type ProjectDto,
  type ProjectStatus,
  type ProjectPriority,
} from "@/lib/api/projects-api";

function getStatusBadge(status: ProjectStatus) {
  switch (status) {
    case "PLANNING":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Planning
        </span>
      );
    case "ACTIVE":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <Play className="w-3 h-3 mr-1" />
          Active
        </span>
      );
    case "ON_HOLD":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Pause className="w-3 h-3 mr-1" />
          On Hold
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Completed
        </span>
      );
    case "ARCHIVED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border">
          <Archive className="w-3 h-3 mr-1" />
          Archived
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          Cancelled
        </span>
      );
  }
}

function getPriorityBadge(priority: ProjectPriority) {
  switch (priority) {
    case "URGENT":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          Urgent
        </span>
      );
    case "HIGH":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          High
        </span>
      );
    case "MEDIUM":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          Medium
        </span>
      );
    case "LOW":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          Low
        </span>
      );
  }
}

export default function ProjectsPage() {
  const [projects, setProjects] = React.useState<ProjectDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState<ProjectDto | null>(
    null,
  );
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchProjects = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Projects");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const activeCount = React.useMemo(
    () => projects.filter((p) => p.status === "ACTIVE").length,
    [projects],
  );
  const planningCount = React.useMemo(
    () => projects.filter((p) => p.status === "PLANNING").length,
    [projects],
  );
  const completedCount = React.useMemo(
    () => projects.filter((p) => p.status === "COMPLETED").length,
    [projects],
  );

  const columns = React.useMemo<ColumnDef<ProjectDto>[]>(
    () => [
      {
        accessorKey: "projectNumber",
        header: "Project #",
        cell: ({ row }) => (
          <Link
            href={`/projects/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold"
          >
            {row.original.projectNumber}
          </Link>
        ),
      },
      {
        accessorKey: "name",
        header: "Project Name",
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <span className="text-xs font-medium text-foreground">
              {row.original.name}
            </span>
            {row.original.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                {row.original.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "projectType",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground capitalize">
            {row.original.projectType.replace(/_/g, " ").toLowerCase()}
          </span>
        ),
      },
      {
        accessorKey: "projectManager",
        header: "Manager",
        cell: ({ row }) => (
          <span className="text-xs font-medium text-foreground">
            {row.original.projectManager}
          </span>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => getPriorityBadge(row.original.priority),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        id: "materials",
        header: "Materials",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground font-bold">
            {row.original.materials.length} items
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/projects/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View project">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            {(row.original.status === "PLANNING" ||
              row.original.status === "ACTIVE" ||
              row.original.status === "ON_HOLD") && (
              <Button
                variant="ghost"
                size="icon-xs"
                title="Edit project"
                onClick={() => {
                  setEditingProject(row.original);
                  setIsFormOpen(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const filterConfigs: FilterConfig[] = React.useMemo(
    () => [
      {
        columnId: "status",
        title: "Status",
        options: [
          { label: "Planning", value: "PLANNING" },
          { label: "Active", value: "ACTIVE" },
          { label: "On Hold", value: "ON_HOLD" },
          { label: "Completed", value: "COMPLETED" },
          { label: "Archived", value: "ARCHIVED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      {
        columnId: "priority",
        title: "Priority",
        options: [
          { label: "Urgent", value: "URGENT" },
          { label: "High", value: "HIGH" },
          { label: "Medium", value: "MEDIUM" },
          { label: "Low", value: "LOW" },
        ],
      },
      {
        columnId: "projectType",
        title: "Type",
        options: [
          { label: "Customer", value: "CUSTOMER" },
          { label: "Internal", value: "INTERNAL" },
          { label: "R&D", value: "R_AND_D" },
          { label: "Prototype", value: "PROTOTYPE" },
          { label: "Installation", value: "INSTALLATION" },
          { label: "Manufacturing", value: "MANUFACTURING_INITIATIVE" },
        ],
      },
    ],
    [],
  );

  const handleFormSuccess = (saved: ProjectDto) => {
    setToastMessage(`Project "${saved.projectNumber}" saved.`);
    setIsFormOpen(false);
    setEditingProject(null);
    setTimeout(() => setToastMessage(null), 4000);
    fetchProjects();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Projects"
        description="Manage projects, allocate materials, and track milestones."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingProject(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Project
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Projects"
          value={projects.length}
          subtitle="All tracked projects"
          icon={FolderKanban}
        />
        <StatCard
          title="Active"
          value={activeCount}
          subtitle="In-progress projects"
          icon={Play}
        />
        <StatCard
          title="Planning"
          value={planningCount}
          subtitle="Awaiting kickoff"
          icon={Clock}
        />
        <StatCard
          title="Completed"
          value={completedCount}
          subtitle="Delivered projects"
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
          <Button variant="ghost" size="xs" onClick={fetchProjects}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Creation / Edit Modal */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingProject(null);
          }
        }}
        title={editingProject ? "Edit Project" : "Create Project"}
        description={
          editingProject
            ? `Update project "${editingProject.projectNumber}" with current ownership, dates, and priority.`
            : "Create a project with ownership, schedule, and priority details for downstream planning."
        }
        size="md"
      >
        <ProjectForm
          initialData={editingProject}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingProject(null);
          }}
        />
      </DialogShell>

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={projects}
        searchKey="projectNumber"
        searchPlaceholder="Search by project # or name..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Projects found"
        emptyMessage="Get started by creating your first project to manage materials and milestones."
      />
    </div>
  );
}
