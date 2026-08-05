"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  Clock,
  XCircle,
  Pencil,
  Calendar,
  Layers,
  User,
  X,
  Play,
  Pause,
  Archive,
  FolderKanban,
  Package,
  Target,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ProjectForm } from "@/components/projects/project-form";
import {
  projectsApi,
  type ProjectDto,
  type ProjectStatus,
  type ProjectPriority,
  type AllocateMaterialPayload,
  type IssueMaterialPayload,
  type ReturnMaterialPayload,
} from "@/lib/api/projects-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getStatusBadge(status: ProjectStatus) {
  switch (status) {
    case "PLANNING":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          PLANNING
        </span>
      );
    case "ACTIVE":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <Play className="w-3 h-3 mr-1" />
          ACTIVE
        </span>
      );
    case "ON_HOLD":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Pause className="w-3 h-3 mr-1" />
          ON HOLD
        </span>
      );
    case "COMPLETED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          COMPLETED
        </span>
      );
    case "ARCHIVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <Archive className="w-3 h-3 mr-1" />
          ARCHIVED
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          CANCELLED
        </span>
      );
  }
}

function getPriorityLabel(priority: ProjectPriority) {
  const map: Record<ProjectPriority, string> = {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    URGENT: "Urgent",
  };
  return map[priority] || priority;
}

export default function ViewProjectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [project, setProject] = React.useState<ProjectDto | null>(null);
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [componentsList, setComponentsList] = React.useState<ComponentDto[]>(
    [],
  );
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [locationsList, setLocationsList] = React.useState<LocationDto[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isPausing, setIsPausing] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const [showStartDialog, setShowStartDialog] = React.useState(false);
  const [showPauseDialog, setShowPauseDialog] = React.useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = React.useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);

  // Material form state
  const [showAllocateForm, setShowAllocateForm] = React.useState(false);
  const [showIssueForm, setShowIssueForm] = React.useState(false);
  const [showReturnForm, setShowReturnForm] = React.useState(false);
  const [materialError, setMaterialError] = React.useState<string | null>(null);
  const [materialSubmitting, setMaterialSubmitting] = React.useState(false);

  const [matComponentId, setMatComponentId] = React.useState("");
  const [matLocationId, setMatLocationId] = React.useState("");
  const [matQuantity, setMatQuantity] = React.useState("");
  const [matUnit, setMatUnit] = React.useState("pcs");
  const [matNotes, setMatNotes] = React.useState("");

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await projectsApi.getById(id);
      setProject(data);

      const [comps, locs] = await Promise.all([
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
      ]);

      setComponentsList(comps);
      setLocationsList(locs);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load Project details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStart = async () => {
    if (!project) return;
    setIsStarting(true);
    try {
      const updated = await projectsApi.start(project.id);
      setProject(updated);
      setShowStartDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start project");
    } finally {
      setIsStarting(false);
    }
  };

  const handlePause = async () => {
    if (!project) return;
    setIsPausing(true);
    try {
      const updated = await projectsApi.pause(project.id);
      setProject(updated);
      setShowPauseDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to pause project");
    } finally {
      setIsPausing(false);
    }
  };

  const handleComplete = async () => {
    if (!project) return;
    setIsCompleting(true);
    try {
      const updated = await projectsApi.complete(project.id);
      setProject(updated);
      setShowCompleteDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to complete project",
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const handleArchive = async () => {
    if (!project) return;
    setIsArchiving(true);
    try {
      const updated = await projectsApi.archive(project.id);
      setProject(updated);
      setShowArchiveDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to archive project",
      );
    } finally {
      setIsArchiving(false);
    }
  };

  const handleCancel = async () => {
    if (!project) return;
    setIsCancelling(true);
    try {
      const updated = await projectsApi.cancel(project.id);
      setProject(updated);
      setShowCancelDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel project");
    } finally {
      setIsCancelling(false);
    }
  };

  const resetMaterialForm = () => {
    setMatComponentId("");
    setMatLocationId("");
    setMatQuantity("");
    setMatUnit("pcs");
    setMatNotes("");
    setMaterialError(null);
    setShowAllocateForm(false);
    setShowIssueForm(false);
    setShowReturnForm(false);
  };

  const handleAllocateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!matComponentId || !matLocationId || !matQuantity) {
      setMaterialError("Component, location, and quantity are required");
      return;
    }
    setMaterialSubmitting(true);
    setMaterialError(null);
    try {
      const payload: AllocateMaterialPayload = {
        componentId: matComponentId,
        locationId: matLocationId,
        quantity: parseFloat(matQuantity),
        unitOfMeasure: matUnit || "pcs",
        notes: matNotes || undefined,
      };
      const updated = await projectsApi.allocateMaterial(project.id, payload);
      setProject(updated);
      resetMaterialForm();
      fetchData();
    } catch (err: unknown) {
      setMaterialError(
        err instanceof Error ? err.message : "Allocation failed",
      );
    } finally {
      setMaterialSubmitting(false);
    }
  };

  const handleIssueMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!matComponentId || !matLocationId || !matQuantity) {
      setMaterialError("Component, location, and quantity are required");
      return;
    }
    setMaterialSubmitting(true);
    setMaterialError(null);
    try {
      const payload: IssueMaterialPayload = {
        componentId: matComponentId,
        locationId: matLocationId,
        quantity: parseFloat(matQuantity),
      };
      const updated = await projectsApi.issueMaterial(project.id, payload);
      setProject(updated);
      resetMaterialForm();
      fetchData();
    } catch (err: unknown) {
      setMaterialError(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setMaterialSubmitting(false);
    }
  };

  const handleReturnMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!matComponentId || !matLocationId || !matQuantity) {
      setMaterialError("Component, location, and quantity are required");
      return;
    }
    setMaterialSubmitting(true);
    setMaterialError(null);
    try {
      const payload: ReturnMaterialPayload = {
        componentId: matComponentId,
        locationId: matLocationId,
        quantity: parseFloat(matQuantity),
      };
      const updated = await projectsApi.returnMaterial(project.id, payload);
      setProject(updated);
      resetMaterialForm();
      fetchData();
    } catch (err: unknown) {
      setMaterialError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setMaterialSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading Project details..." />;
  }

  if (error || !project) {
    return (
      <ErrorState
        title="Project Not Found"
        message={error || "The requested Project record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  const totalAllocated = project.materials.reduce(
    (s, m) => s + m.allocatedQuantity,
    0,
  );
  const totalIssued = project.materials.reduce(
    (s, m) => s + m.issuedQuantity,
    0,
  );
  const isEditable = ["PLANNING", "ACTIVE", "ON_HOLD"].includes(project.status);
  const canAllocate = ["PLANNING", "ACTIVE", "ON_HOLD"].includes(
    project.status,
  );
  const canIssueReturn = project.status === "ACTIVE";

  const renderMaterialForm = (
    title: string,
    onSubmit: (e: React.FormEvent) => void,
    submitLabel: string,
    showNotes = false,
  ) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={resetMaterialForm}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {materialError && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{materialError}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <Field>
            <FieldLabel htmlFor="mat-comp">
              Component <span className="text-destructive">*</span>
            </FieldLabel>
            <Select
              value={matComponentId}
              onValueChange={(val) => setMatComponentId(val ?? "")}
            >
              <SelectTrigger id="mat-comp">
                <SelectValue placeholder="Select component..." />
              </SelectTrigger>
              <SelectContent>
                {componentsList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.sku} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="mat-loc">
                Location <span className="text-destructive">*</span>
              </FieldLabel>
              <Select
                value={matLocationId}
                onValueChange={(val) => setMatLocationId(val ?? "")}
              >
                <SelectTrigger id="mat-loc">
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locationsList.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="mat-qty">
                Quantity <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="mat-qty"
                type="number"
                step="any"
                min="0.0001"
                value={matQuantity}
                onChange={(e) => setMatQuantity(e.target.value)}
                placeholder="0"
                className="font-mono font-bold"
              />
            </Field>
          </div>

          {showNotes && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="mat-unit">Unit</FieldLabel>
                <Input
                  id="mat-unit"
                  type="text"
                  value={matUnit}
                  onChange={(e) => setMatUnit(e.target.value)}
                  placeholder="pcs"
                  className="font-mono"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="mat-notes">Notes</FieldLabel>
                <Input
                  id="mat-notes"
                  type="text"
                  value={matNotes}
                  onChange={(e) => setMatNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </Field>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetMaterialForm}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={materialSubmitting}>
              {materialSubmitting && (
                <span className="w-3.5 h-3.5 mr-1.5 animate-spin inline-block border-2 border-current border-t-transparent rounded-full" />
              )}
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={project.projectNumber}
        description={`${project.name} — ${project.projectType.replace(/_/g, " ").toLowerCase()} project`}
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.projectNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/projects")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print
            </Button>

            {isEditable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(true)}
              >
                <Pencil className="w-4 h-4 mr-1.5" />
                Edit
              </Button>
            )}

            {(project.status === "PLANNING" ||
              project.status === "ON_HOLD") && (
              <Button size="sm" onClick={() => setShowStartDialog(true)}>
                <Play className="w-4 h-4 mr-1.5" />
                Start Project
              </Button>
            )}

            {project.status === "ACTIVE" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPauseDialog(true)}
                >
                  <Pause className="w-4 h-4 mr-1.5" />
                  Pause
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowCompleteDialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Complete
                </Button>
              </>
            )}

            {!["ARCHIVED", "CANCELLED"].includes(project.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCancelDialog(true)}
              >
                Cancel
              </Button>
            )}

            {(project.status === "COMPLETED" ||
              project.status === "CANCELLED") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchiveDialog(true)}
              >
                <Archive className="w-4 h-4 mr-1.5" />
                Archive
              </Button>
            )}
          </div>
        }
      />

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                Edit Project
              </h2>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ProjectForm
              initialData={project}
              onSuccess={(updated) => {
                setProject(updated);
                setIsEditOpen(false);
                fetchData();
              }}
              onCancel={() => setIsEditOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Material Forms */}
      {showAllocateForm &&
        renderMaterialForm(
          "Allocate Material",
          handleAllocateMaterial,
          "Allocate",
          true,
        )}
      {showIssueForm &&
        renderMaterialForm(
          "Issue Material",
          handleIssueMaterial,
          "Issue Material",
        )}
      {showReturnForm &&
        renderMaterialForm(
          "Return Material",
          handleReturnMaterial,
          "Return Material",
        )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Materials"
          value={`${project.materials.length} items`}
          subtitle="Allocated line items"
          icon={Package}
        />
        <StatCard
          title="Total Allocated"
          value={`${totalAllocated} units`}
          subtitle="Reserved materials"
          icon={Layers}
        />
        <StatCard
          title="Total Issued"
          value={`${totalIssued} units`}
          subtitle="Consumed materials"
          icon={Layers}
        />
        <StatCard
          title="Milestones"
          value={`${project.milestones.length}`}
          subtitle={`${project.milestones.filter((m) => m.status === "COMPLETED").length} completed`}
          icon={Target}
        />
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Project Details
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Project parameters, scheduling, and ownership.
              </p>
            </div>
            <div>{getStatusBadge(project.status)}</div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Project Number
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {project.projectNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Project Type
              </dt>
              <dd className="mt-1 text-sm text-foreground capitalize">
                {project.projectType.replace(/_/g, " ").toLowerCase()}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Project Manager
              </dt>
              <dd className="mt-1 font-medium text-foreground flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {project.projectManager}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Owner
              </dt>
              <dd className="mt-1 font-medium text-foreground flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {project.owner}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Priority
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {getPriorityLabel(project.priority)}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Start Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {new Date(project.startDate).toLocaleDateString()}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Target Completion
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {new Date(project.targetCompletionDate).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          {project.description && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Description
              </span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {project.description}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Created: {new Date(project.createdAt).toLocaleString()}</span>
            <span>Updated: {new Date(project.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Lifecycle Flow */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">
            Lifecycle Stage
          </h3>

          <div className="space-y-4 pt-2">
            {(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"] as const).map(
              (stage, idx) => {
                const labels: Record<string, { label: string; desc: string }> =
                  {
                    PLANNING: {
                      label: "Planning",
                      desc: "Project created, allocations open",
                    },
                    ACTIVE: { label: "Active", desc: "Production in progress" },
                    ON_HOLD: { label: "On Hold", desc: "Temporarily paused" },
                    COMPLETED: {
                      label: "Completed",
                      desc: "Deliverables accepted",
                    },
                  };
                const stageOrder = [
                  "PLANNING",
                  "ACTIVE",
                  "ON_HOLD",
                  "COMPLETED",
                ] as const;
                const currentIdx = stageOrder.indexOf(
                  project.status as (typeof stageOrder)[number],
                );
                const isReached =
                  currentIdx >= idx ||
                  (project.status === "ON_HOLD" && stage === "ON_HOLD");
                const colors = isReached
                  ? stage === "COMPLETED"
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : stage === "ON_HOLD"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                      : stage === "ACTIVE"
                        ? "bg-blue-500/20 text-blue-700 dark:text-blue-400"
                        : "bg-slate-500/20 text-slate-700 dark:text-slate-300"
                  : "bg-muted text-muted-foreground";

                const info = labels[stage]!;

                return (
                  <div key={stage} className="flex items-start gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${colors}`}
                    >
                      {idx + 1}
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-foreground">
                        {info.label}
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        {info.desc}
                      </p>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>

      {/* Materials Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Material Allocations ({project.materials.length} Lines)
          </h3>
          <div className="flex items-center gap-2 print:hidden">
            {canAllocate && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => setShowAllocateForm(true)}
              >
                <Package className="w-3.5 h-3.5 mr-1" />
                Allocate
              </Button>
            )}
            {canIssueReturn && (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setShowIssueForm(true)}
                >
                  Issue
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setShowReturnForm(true)}
                >
                  Return
                </Button>
              </>
            )}
          </div>
        </div>

        {project.materials.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 bg-muted/20 border border-border rounded-lg text-center">
            No materials allocated to this project. Use &quot;Allocate&quot; to
            reserve components.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Component</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-right">Allocated</th>
                  <th className="p-3 text-right">Issued</th>
                  <th className="p-3 text-right">Returned</th>
                  <th className="p-3 text-right">Net Issued</th>
                  <th className="p-3">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {project.materials.map((mat, idx) => {
                  const comp = componentsMap[mat.componentId];
                  const loc = locationsMap[mat.locationId];
                  const netIssued = mat.issuedQuantity - mat.returnedQuantity;
                  return (
                    <tr
                      key={mat.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3 text-muted-foreground font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-3 font-medium">
                        {comp ? (
                          <Link
                            href={`/components/${comp.id}`}
                            className="text-foreground hover:underline"
                          >
                            {comp.name}{" "}
                            <span className="font-mono text-muted-foreground text-[11px]">
                              ({comp.sku})
                            </span>
                          </Link>
                        ) : (
                          <span className="font-mono">
                            {mat.componentId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {loc ? (
                          <span className="text-xs text-foreground">
                            {loc.name}{" "}
                            <span className="font-mono text-muted-foreground text-[11px]">
                              ({loc.code})
                            </span>
                          </span>
                        ) : (
                          <span className="font-mono text-xs">
                            {mat.locationId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-foreground">
                        {mat.allocatedQuantity}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {mat.issuedQuantity}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                        {mat.returnedQuantity}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-foreground">
                        {netIssued}
                      </td>
                      <td className="p-3 font-mono text-muted-foreground">
                        {mat.unitOfMeasure}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Milestones */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Milestones ({project.milestones.length})
        </h3>

        {project.milestones.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 bg-muted/20 border border-border rounded-lg text-center">
            No milestones defined. Milestones can be added via the API.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Completion %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {project.milestones.map((ms, idx) => (
                  <tr
                    key={ms.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 text-muted-foreground font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-medium text-foreground">
                      {ms.name}
                    </td>
                    <td className="p-3 text-muted-foreground font-mono">
                      {new Date(ms.dueDate).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      {ms.status === "COMPLETED" ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Complete
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
                          <Clock className="w-3 h-3 mr-1" />
                          Open
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {ms.completionPercentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-semibold text-foreground">
          Activity Log ({project.activities.length} entries)
        </h3>

        {project.activities.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 bg-muted/20 border border-border rounded-lg text-center">
            No activity recorded.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {project.activities.map((act) => (
              <div
                key={act.id}
                className="flex items-start gap-3 p-3 bg-muted/20 border border-border rounded-lg"
              >
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                      {act.activityType}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {new Date(act.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-foreground">{act.description}</p>
                  <p className="text-[11px] text-muted-foreground">
                    By: {act.performedBy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showStartDialog}
        title="Start Project"
        description={`Are you sure you want to start project "${project.projectNumber}"? The project will become ACTIVE and material issue will be enabled.`}
        confirmText="Start Project"
        loading={isStarting}
        variant="default"
        onConfirm={handleStart}
        onCancel={() => setShowStartDialog(false)}
      />

      <ConfirmDialog
        isOpen={showPauseDialog}
        title="Pause Project"
        description={`Are you sure you want to pause project "${project.projectNumber}"? Material issues will be temporarily disabled.`}
        confirmText="Pause Project"
        loading={isPausing}
        variant="default"
        onConfirm={handlePause}
        onCancel={() => setShowPauseDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCompleteDialog}
        title="Complete Project"
        description={`Are you sure you want to mark project "${project.projectNumber}" as complete? The project will become read-only.`}
        confirmText="Complete Project"
        loading={isCompleting}
        variant="default"
        onConfirm={handleComplete}
        onCancel={() => setShowCompleteDialog(false)}
      />

      <ConfirmDialog
        isOpen={showArchiveDialog}
        title="Archive Project"
        description={`Are you sure you want to archive project "${project.projectNumber}"?`}
        confirmText="Archive Project"
        loading={isArchiving}
        variant="default"
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Project"
        description={`Are you sure you want to cancel project "${project.projectNumber}"? This action will close all material operations.`}
        confirmText="Cancel Project"
        loading={isCancelling}
        variant="destructive"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />
    </div>
  );
}
