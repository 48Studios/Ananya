"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Printer, CheckCircle2, Clock, XCircle, Pencil, Calendar, Layers, User, Play, Pause, Archive, FolderKanban, Package, Target, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
import {
  inventoryProjectionsApi,
  type InventoryProjectionDto,
} from "@/lib/api/inventory-projections-api";
import { useAuth } from "@/lib/auth/auth-context";

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
  const id = params?.id as string;
  const { user: currentUser } = useAuth();
  const currentUserName = currentUser
    ? [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") ||
      currentUser.email
    : "";

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
  const [, setLocationsList] = React.useState<LocationDto[]>([]);

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

  // Allocate Material state (2A)
  const [showAllocateForm, setShowAllocateForm] = React.useState(false);
  const [allocComponentId, setAllocComponentId] = React.useState("");
  const [allocLocationId, setAllocLocationId] = React.useState("");
  const [allocQuantity, setAllocQuantity] = React.useState("");
  const [allocUnit, setAllocUnit] = React.useState("pcs");
  const [allocNotes, setAllocNotes] = React.useState("");
  const [allocError, setAllocError] = React.useState<string | null>(null);
  const [allocSubmitting, setAllocSubmitting] = React.useState(false);
  const [allocLoadingProjections, setAllocLoadingProjections] =
    React.useState(false);
  const [allocProjections, setAllocProjections] = React.useState<
    InventoryProjectionDto[]
  >([]);

  // Issue Material state (2B)
  const [showIssueForm, setShowIssueForm] = React.useState(false);
  const [issueSelectedMatId, setIssueSelectedMatId] = React.useState("");
  const [issueQuantity, setIssueQuantity] = React.useState("");
  const [issueError, setIssueError] = React.useState<string | null>(null);
  const [issueSubmitting, setIssueSubmitting] = React.useState(false);

  // Return Material state (2C)
  const [showReturnForm, setShowReturnForm] = React.useState(false);
  const [returnComponentId, setReturnComponentId] = React.useState("");
  const [returnLocationId, setReturnLocationId] = React.useState("");
  const [returnQuantity, setReturnQuantity] = React.useState("");
  const [returnError, setReturnError] = React.useState<string | null>(null);
  const [returnSubmitting, setReturnSubmitting] = React.useState(false);

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
      const updated = await projectsApi.start(
        project.id,
        currentUserName || undefined,
      );
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
      const updated = await projectsApi.pause(
        project.id,
        currentUserName || undefined,
      );
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
      const updated = await projectsApi.complete(
        project.id,
        currentUserName || undefined,
      );
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
      const updated = await projectsApi.archive(
        project.id,
        currentUserName || undefined,
      );
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
      const updated = await projectsApi.cancel(
        project.id,
        currentUserName || undefined,
      );
      setProject(updated);
      setShowCancelDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel project");
    } finally {
      setIsCancelling(false);
    }
  };

  // Allocate Material helpers (2A)
  const handleAllocComponentChange = async (compId: string) => {
    setAllocComponentId(compId);
    setAllocLocationId("");
    setAllocQuantity("");
    setAllocError(null);
    const comp = componentsMap[compId];
    if (comp?.unit) {
      setAllocUnit(comp.unit);
    } else {
      setAllocUnit("pcs");
    }

    if (!compId) {
      setAllocProjections([]);
      return;
    }

    setAllocLoadingProjections(true);
    try {
      const projections = await inventoryProjectionsApi.getByComponent(compId);
      setAllocProjections(projections || []);
    } catch (err) {
      console.error("Failed to load inventory projections", err);
      setAllocProjections([]);
    } finally {
      setAllocLoadingProjections(false);
    }
  };

  const availableAllocProjections = React.useMemo(() => {
    return allocProjections.filter((p) => p.quantity > 0);
  }, [allocProjections]);

  const allocLocationOptions = React.useMemo(() => {
    return availableAllocProjections.map((p) => {
      const loc = locationsMap[p.locationId];
      return {
        value: p.locationId,
        label: loc ? `${loc.name} (${loc.code})` : p.locationId,
        chip: `${p.quantity} ${p.unitOfMeasure || allocUnit} available`,
        sublabel: loc?.kind ? `Type: ${loc.kind}` : undefined,
      };
    });
  }, [availableAllocProjections, locationsMap, allocUnit]);

  const selectedAllocProjection = React.useMemo(() => {
    return availableAllocProjections.find(
      (p) => p.locationId === allocLocationId,
    );
  }, [availableAllocProjections, allocLocationId]);

  const maxAllocQuantity = selectedAllocProjection
    ? selectedAllocProjection.quantity
    : 0;

  const resetAllocateForm = () => {
    setAllocComponentId("");
    setAllocLocationId("");
    setAllocQuantity("");
    setAllocUnit("pcs");
    setAllocNotes("");
    setAllocProjections([]);
    setAllocError(null);
    setShowAllocateForm(false);
  };

  const handleAllocateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!allocComponentId) {
      setAllocError("Please select a component");
      return;
    }
    if (!allocLocationId) {
      setAllocError("Please select a location with available stock");
      return;
    }
    const qty = parseFloat(allocQuantity);
    if (!allocQuantity || isNaN(qty) || qty <= 0) {
      setAllocError("Please enter a valid quantity greater than 0");
      return;
    }
    if (qty > maxAllocQuantity) {
      setAllocError(
        `Quantity cannot exceed available stock (${maxAllocQuantity} ${allocUnit}) at selected location`,
      );
      return;
    }

    setAllocSubmitting(true);
    setAllocError(null);
    try {
      const payload: AllocateMaterialPayload = {
        componentId: allocComponentId,
        locationId: allocLocationId,
        quantity: qty,
        unitOfMeasure: allocUnit,
        notes: allocNotes.trim() || undefined,
        performedBy: currentUserName || undefined,
      };
      const updated = await projectsApi.allocateMaterial(project.id, payload);
      setProject(updated);
      resetAllocateForm();
      fetchData();
    } catch (err: unknown) {
      setAllocError(err instanceof Error ? err.message : "Allocation failed");
    } finally {
      setAllocSubmitting(false);
    }
  };

  // Issue Material helpers (2B)
  const issueEligibleMaterials = React.useMemo(() => {
    if (!project) return [];
    return project.materials.filter((mat) => {
      const unissued =
        mat.allocatedQuantity - (mat.issuedQuantity - mat.returnedQuantity);
      return unissued > 0;
    });
  }, [project]);

  const issueComponentOptions = React.useMemo(() => {
    return issueEligibleMaterials.map((mat) => {
      const comp = componentsMap[mat.componentId];
      const loc = locationsMap[mat.locationId];
      const unissued =
        mat.allocatedQuantity - (mat.issuedQuantity - mat.returnedQuantity);
      return {
        value: mat.id,
        label: comp ? comp.name : mat.componentId,
        chip: comp ? comp.sku : undefined,
        sublabel: `Location: ${loc ? `${loc.name} (${loc.code})` : mat.locationId} • Unissued: ${unissued} ${mat.unitOfMeasure}`,
      };
    });
  }, [issueEligibleMaterials, componentsMap, locationsMap]);

  const selectedIssueMat = React.useMemo(() => {
    return project?.materials.find((m) => m.id === issueSelectedMatId);
  }, [project, issueSelectedMatId]);

  const selectedIssueLoc = selectedIssueMat
    ? locationsMap[selectedIssueMat.locationId]
    : null;
  const maxIssueQuantity = selectedIssueMat
    ? selectedIssueMat.allocatedQuantity -
      (selectedIssueMat.issuedQuantity - selectedIssueMat.returnedQuantity)
    : 0;

  const resetIssueForm = () => {
    setIssueSelectedMatId("");
    setIssueQuantity("");
    setIssueError(null);
    setShowIssueForm(false);
  };

  const handleIssueMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedIssueMat) {
      setIssueError("Please select an allocated component");
      return;
    }
    const qty = parseFloat(issueQuantity);
    if (!issueQuantity || isNaN(qty) || qty <= 0) {
      setIssueError("Please enter a valid quantity greater than 0");
      return;
    }
    if (qty > maxIssueQuantity) {
      setIssueError(
        `Quantity cannot exceed remaining allocated balance (${maxIssueQuantity} ${selectedIssueMat.unitOfMeasure})`,
      );
      return;
    }

    setIssueSubmitting(true);
    setIssueError(null);
    try {
      const payload: IssueMaterialPayload = {
        componentId: selectedIssueMat.componentId,
        locationId: selectedIssueMat.locationId,
        quantity: qty,
        performedBy: currentUserName || undefined,
      };
      const updated = await projectsApi.issueMaterial(project.id, payload);
      setProject(updated);
      resetIssueForm();
      fetchData();
    } catch (err: unknown) {
      setIssueError(err instanceof Error ? err.message : "Issue failed");
    } finally {
      setIssueSubmitting(false);
    }
  };

  // Return Material helpers (2C)
  const returnEligibleMaterials = React.useMemo(() => {
    if (!project) return [];
    return project.materials.filter((mat) => {
      const netIssued = mat.issuedQuantity - mat.returnedQuantity;
      return netIssued > 0;
    });
  }, [project]);

  const returnComponentOptions = React.useMemo(() => {
    const compIdMap = new Map<string, number>();
    for (const mat of returnEligibleMaterials) {
      const netIssued = mat.issuedQuantity - mat.returnedQuantity;
      compIdMap.set(
        mat.componentId,
        (compIdMap.get(mat.componentId) || 0) + netIssued,
      );
    }
    return Array.from(compIdMap.entries()).map(([cid, totalNetIssued]) => {
      const comp = componentsMap[cid];
      return {
        value: cid,
        label: comp ? comp.name : cid,
        chip: comp ? comp.sku : undefined,
        sublabel: `Total Issued: ${totalNetIssued} ${comp?.unit || "units"}`,
      };
    });
  }, [returnEligibleMaterials, componentsMap]);

  const handleReturnComponentChange = (compId: string) => {
    setReturnComponentId(compId);
    setReturnQuantity("");
    setReturnError(null);
    const locs = returnEligibleMaterials
      .filter((m) => m.componentId === compId)
      .map((m) => m.locationId);
    if (locs.length === 1 && locs[0]) {
      setReturnLocationId(locs[0]);
    } else {
      setReturnLocationId("");
    }
  };

  const returnLocationOptions = React.useMemo(() => {
    if (!returnComponentId) return [];
    return returnEligibleMaterials
      .filter((m) => m.componentId === returnComponentId)
      .map((m) => {
        const loc = locationsMap[m.locationId];
        const netIssued = m.issuedQuantity - m.returnedQuantity;
        return {
          value: m.locationId,
          label: loc ? `${loc.name} (${loc.code})` : m.locationId,
          chip: `${netIssued} ${m.unitOfMeasure} returnable`,
          sublabel: loc?.kind ? `Type: ${loc.kind}` : undefined,
        };
      });
  }, [returnComponentId, returnEligibleMaterials, locationsMap]);

  const selectedReturnMat = React.useMemo(() => {
    return project?.materials.find(
      (m) =>
        m.componentId === returnComponentId &&
        m.locationId === returnLocationId,
    );
  }, [project, returnComponentId, returnLocationId]);

  const maxReturnQuantity = selectedReturnMat
    ? selectedReturnMat.issuedQuantity - selectedReturnMat.returnedQuantity
    : 0;

  const resetReturnForm = () => {
    setReturnComponentId("");
    setReturnLocationId("");
    setReturnQuantity("");
    setReturnError(null);
    setShowReturnForm(false);
  };

  const handleReturnMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    if (!returnComponentId) {
      setReturnError("Please select a component");
      return;
    }
    if (!returnLocationId) {
      setReturnError("Please select a storage location");
      return;
    }
    const qty = parseFloat(returnQuantity);
    if (!returnQuantity || isNaN(qty) || qty <= 0) {
      setReturnError("Please enter a valid quantity greater than 0");
      return;
    }
    if (qty > maxReturnQuantity) {
      setReturnError(
        `Quantity cannot exceed net issued balance (${maxReturnQuantity} ${selectedReturnMat?.unitOfMeasure || ""})`,
      );
      return;
    }

    setReturnSubmitting(true);
    setReturnError(null);
    try {
      const payload: ReturnMaterialPayload = {
        componentId: returnComponentId,
        locationId: returnLocationId,
        quantity: qty,
        performedBy: currentUserName || undefined,
      };
      const updated = await projectsApi.returnMaterial(project.id, payload);
      setProject(updated);
      resetReturnForm();
      fetchData();
    } catch (err: unknown) {
      setReturnError(err instanceof Error ? err.message : "Return failed");
    } finally {
      setReturnSubmitting(false);
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

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        backHref="/projects"
        backLabel="Back to Projects"
        title={project.projectNumber}
        description={`${project.name} — ${project.projectType.replace(/_/g, " ").toLowerCase()} project`}
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.projectNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
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
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Project"
        description={`Update project "${project.projectNumber}" with current ownership, dates, and priority.`}
        size="sm"
      >
        <ProjectForm
          initialData={project}
          onSuccess={(updated) => {
            setProject(updated);
            setIsEditOpen(false);
            fetchData();
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {/* Allocate Material Modal (Req 2A, 4) */}
      <DialogShell
        open={showAllocateForm}
        onOpenChange={(open) => {
          if (!open) resetAllocateForm();
        }}
        title="Allocate Material"
        description={`Reserve planned component quantity against project "${project.projectNumber}" from available inventory.`}
        size="sm"
      >
        <form
          onSubmit={handleAllocateMaterial}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogShellBody className="space-y-3">
            {allocError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{allocError}</span>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="alloc-comp">
                Component <span className="text-destructive">*</span>
              </FieldLabel>
              <SearchableSelect
                id="alloc-comp"
                value={allocComponentId}
                onValueChange={handleAllocComponentChange}
                placeholder="Select component..."
                searchPlaceholder="Search components by name or SKU..."
                emptyText="No components found."
                disabled={allocSubmitting}
                options={componentsList.map((c) => ({
                  value: c.id,
                  label: c.name,
                  chip: c.sku,
                  sublabel: c.unit ? `Unit: ${c.unit}` : undefined,
                }))}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="alloc-loc">
                Location <span className="text-destructive">*</span>
              </FieldLabel>
              <SearchableSelect
                id="alloc-loc"
                value={allocLocationId}
                onValueChange={(val) => {
                  setAllocLocationId(val ?? "");
                  setAllocQuantity("");
                  setAllocError(null);
                }}
                placeholder={
                  allocLoadingProjections
                    ? "Loading available stock locations..."
                    : !allocComponentId
                      ? "Select a component first..."
                      : allocLocationOptions.length === 0
                        ? "No locations have available stock"
                        : "Select location with available stock..."
                }
                searchPlaceholder="Search locations with stock..."
                emptyText={
                  allocLoadingProjections
                    ? "Loading..."
                    : !allocComponentId
                      ? "Select a component first."
                      : "No locations have stock for this component."
                }
                disabled={
                  allocSubmitting ||
                  !allocComponentId ||
                  allocLoadingProjections ||
                  allocLocationOptions.length === 0
                }
                options={allocLocationOptions}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="alloc-qty">
                  Quantity <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="alloc-qty"
                  type="number"
                  step="any"
                  min="0.0001"
                  max={maxAllocQuantity > 0 ? maxAllocQuantity : undefined}
                  value={allocQuantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAllocQuantity(val);
                    if (val && parseFloat(val) > maxAllocQuantity) {
                      setAllocError(
                        `Quantity cannot exceed available stock (${maxAllocQuantity} ${allocUnit})`,
                      );
                    } else {
                      setAllocError(null);
                    }
                  }}
                  placeholder="0"
                  disabled={!allocLocationId || allocSubmitting}
                  className="font-mono font-bold"
                />
                {allocLocationId && selectedAllocProjection && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span>
                      Available:{" "}
                      <strong className="text-foreground">
                        {maxAllocQuantity} {allocUnit}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllocQuantity(String(maxAllocQuantity))}
                      className="text-primary hover:underline font-medium"
                    >
                      Fill Max
                    </button>
                  </div>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="alloc-unit">Unit</FieldLabel>
                <Input
                  id="alloc-unit"
                  type="text"
                  readOnly
                  disabled
                  value={allocUnit}
                  className="font-mono bg-muted text-muted-foreground cursor-not-allowed"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="alloc-notes">Notes</FieldLabel>
              <Input
                id="alloc-notes"
                type="text"
                value={allocNotes}
                onChange={(e) => setAllocNotes(e.target.value)}
                placeholder="Optional notes"
                disabled={allocSubmitting}
              />
            </Field>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton onClick={resetAllocateForm}>
              Cancel
            </DialogShellCancelButton>
            <Button
              type="submit"
              size="sm"
              disabled={
                allocSubmitting ||
                !allocComponentId ||
                !allocLocationId ||
                !allocQuantity ||
                parseFloat(allocQuantity) <= 0 ||
                parseFloat(allocQuantity) > maxAllocQuantity
              }
            >
              {allocSubmitting && (
                <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Allocate
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>

      {/* Issue Material Modal (Req 2B) */}
      <DialogShell
        open={showIssueForm}
        onOpenChange={(open) => {
          if (!open) resetIssueForm();
        }}
        title="Issue Material"
        description={`Issue allocated component stock to project "${project.projectNumber}".`}
        size="sm"
      >
        <form
          onSubmit={handleIssueMaterial}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogShellBody className="space-y-3">
            {issueError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{issueError}</span>
              </div>
            )}

            {issueEligibleMaterials.length === 0 && (
              <div className="p-3 bg-muted/40 border border-border rounded-lg text-xs text-muted-foreground text-center">
                No unissued allocated components available on this project.
                Allocate materials first.
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="issue-comp">
                Allocated Component <span className="text-destructive">*</span>
              </FieldLabel>
              <SearchableSelect
                id="issue-comp"
                value={issueSelectedMatId}
                onValueChange={(val) => {
                  setIssueSelectedMatId(val ?? "");
                  setIssueQuantity("");
                  setIssueError(null);
                }}
                placeholder={
                  issueEligibleMaterials.length === 0
                    ? "No allocated components available"
                    : "Select allocated component..."
                }
                searchPlaceholder="Search allocated components..."
                emptyText="No allocated components with unissued balance."
                disabled={issueSubmitting || issueEligibleMaterials.length === 0}
                options={issueComponentOptions}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="issue-loc">Allocated Location</FieldLabel>
              <Input
                id="issue-loc"
                type="text"
                readOnly
                disabled
                value={
                  selectedIssueLoc
                    ? `${selectedIssueLoc.name} (${selectedIssueLoc.code})`
                    : selectedIssueMat
                      ? selectedIssueMat.locationId
                      : "—"
                }
                className="font-mono bg-muted text-muted-foreground cursor-not-allowed"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="issue-qty">
                  Quantity <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="issue-qty"
                  type="number"
                  step="any"
                  min="0.0001"
                  max={maxIssueQuantity > 0 ? maxIssueQuantity : undefined}
                  value={issueQuantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setIssueQuantity(val);
                    if (val && parseFloat(val) > maxIssueQuantity) {
                      setIssueError(
                        `Quantity cannot exceed remaining allocation (${maxIssueQuantity} ${selectedIssueMat?.unitOfMeasure})`,
                      );
                    } else {
                      setIssueError(null);
                    }
                  }}
                  placeholder="0"
                  disabled={!selectedIssueMat || issueSubmitting}
                  className="font-mono font-bold"
                />
                {selectedIssueMat && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span>
                      Max:{" "}
                      <strong className="text-foreground">
                        {maxIssueQuantity} {selectedIssueMat.unitOfMeasure}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIssueQuantity(String(maxIssueQuantity))}
                      className="text-primary hover:underline font-medium"
                    >
                      Fill Max
                    </button>
                  </div>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="issue-unit">Unit</FieldLabel>
                <Input
                  id="issue-unit"
                  type="text"
                  readOnly
                  disabled
                  value={selectedIssueMat?.unitOfMeasure || "pcs"}
                  className="font-mono bg-muted text-muted-foreground cursor-not-allowed"
                />
              </Field>
            </div>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton onClick={resetIssueForm}>
              Cancel
            </DialogShellCancelButton>
            <Button
              type="submit"
              size="sm"
              disabled={
                issueSubmitting ||
                !selectedIssueMat ||
                !issueQuantity ||
                parseFloat(issueQuantity) <= 0 ||
                parseFloat(issueQuantity) > maxIssueQuantity
              }
            >
              {issueSubmitting && (
                <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Issue Material
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>

      {/* Return Material Modal (Req 2C, 4) */}
      <DialogShell
        open={showReturnForm}
        onOpenChange={(open) => {
          if (!open) resetReturnForm();
        }}
        title="Return Material"
        description={`Return unused project stock from project "${project.projectNumber}" back into available inventory.`}
        size="sm"
      >
        <form
          onSubmit={handleReturnMaterial}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogShellBody className="space-y-3">
            {returnError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{returnError}</span>
              </div>
            )}

            {returnEligibleMaterials.length === 0 && (
              <div className="p-3 bg-muted/40 border border-border rounded-lg text-xs text-muted-foreground text-center">
                No issued components found on this project to return. Only
                issued materials can be returned.
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="return-comp">
                Component <span className="text-destructive">*</span>
              </FieldLabel>
              <SearchableSelect
                id="return-comp"
                value={returnComponentId}
                onValueChange={handleReturnComponentChange}
                placeholder={
                  returnEligibleMaterials.length === 0
                    ? "No returnable components available"
                    : "Select component to return..."
                }
                searchPlaceholder="Search returnable components..."
                emptyText="No issued components found to return."
                disabled={
                  returnSubmitting || returnEligibleMaterials.length === 0
                }
                options={returnComponentOptions}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="return-loc">
                Storage Location <span className="text-destructive">*</span>
              </FieldLabel>
              <SearchableSelect
                id="return-loc"
                value={returnLocationId}
                onValueChange={(val) => {
                  setReturnLocationId(val ?? "");
                  setReturnQuantity("");
                  setReturnError(null);
                }}
                placeholder={
                  !returnComponentId
                    ? "Select a component first..."
                    : returnLocationOptions.length === 0
                      ? "No locations stored for this component"
                      : "Select location where component is stored..."
                }
                searchPlaceholder="Search storage locations..."
                emptyText="No storage locations found for this component."
                disabled={
                  returnSubmitting ||
                  !returnComponentId ||
                  returnLocationOptions.length === 0
                }
                options={returnLocationOptions}
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="return-qty">
                  Quantity <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="return-qty"
                  type="number"
                  step="any"
                  min="0.0001"
                  max={maxReturnQuantity > 0 ? maxReturnQuantity : undefined}
                  value={returnQuantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setReturnQuantity(val);
                    if (val && parseFloat(val) > maxReturnQuantity) {
                      setReturnError(
                        `Quantity cannot exceed net issued balance (${maxReturnQuantity} ${selectedReturnMat?.unitOfMeasure})`,
                      );
                    } else {
                      setReturnError(null);
                    }
                  }}
                  placeholder="0"
                  disabled={!returnLocationId || returnSubmitting}
                  className="font-mono font-bold"
                />
                {selectedReturnMat && (
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                    <span>
                      Returnable:{" "}
                      <strong className="text-foreground">
                        {maxReturnQuantity} {selectedReturnMat.unitOfMeasure}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setReturnQuantity(String(maxReturnQuantity))
                      }
                      className="text-primary hover:underline font-medium"
                    >
                      Return All
                    </button>
                  </div>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="return-unit">Unit</FieldLabel>
                <Input
                  id="return-unit"
                  type="text"
                  readOnly
                  disabled
                  value={selectedReturnMat?.unitOfMeasure || "pcs"}
                  className="font-mono bg-muted text-muted-foreground cursor-not-allowed"
                />
              </Field>
            </div>
          </DialogShellBody>
          <DialogShellFooter>
            <DialogShellCancelButton onClick={resetReturnForm}>
              Cancel
            </DialogShellCancelButton>
            <Button
              type="submit"
              size="sm"
              disabled={
                returnSubmitting ||
                !returnComponentId ||
                !returnLocationId ||
                !returnQuantity ||
                parseFloat(returnQuantity) <= 0 ||
                parseFloat(returnQuantity) > maxReturnQuantity
              }
            >
              {returnSubmitting && (
                <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Return Material
            </Button>
          </DialogShellFooter>
        </form>
      </DialogShell>

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
                variant="default"
                onClick={() => setShowAllocateForm(true)}
              >
                <Package className="w-3.5 h-3.5 mr-1" />
                Allocate
              </Button>
            )}
            {project.materials.length > 0 && canIssueReturn && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowIssueForm(true)}
                >
                  Issue
                </Button>
                <Button
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
