"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Box,
  Anchor as AnchorIcon,
  Edit3,
  Trash2,
  CheckCircle2,
  Layers,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { RecordStatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  spatialApi,
  type SpatialModelDto,
} from "@/lib/api/spatial-api";
import { SpatialModelDialog } from "@/components/spatial/spatial-model-dialog";
import { SpatialAnchorsDialog } from "@/components/spatial/spatial-anchors-dialog";

export default function SpatialModelsPage() {
  const [models, setModels] = React.useState<SpatialModelDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Model creation/editing state
  const [isModelFormOpen, setIsModelFormOpen] = React.useState(false);
  const [editingModel, setEditingModel] = React.useState<SpatialModelDto | null>(null);

  // Anchors management state
  const [managingAnchorsModel, setManagingAnchorsModel] = React.useState<SpatialModelDto | null>(null);

  // Deletion state
  const [deletingModel, setDeletingModel] = React.useState<SpatialModelDto | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchModels = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await spatialApi.getModels();
      setModels(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load spatial models.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleModelSaved = (savedModel: SpatialModelDto) => {
    if (editingModel) {
      setModels((prev) =>
        prev.map((m) => (m.id === savedModel.id ? savedModel : m)),
      );
      setToastMessage(`Spatial model "${savedModel.code}" updated successfully.`);
    } else {
      setModels((prev) => [savedModel, ...prev]);
      setToastMessage(`Spatial model "${savedModel.code}" created successfully.`);
    }
    setIsModelFormOpen(false);
    setEditingModel(null);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const confirmDelete = async () => {
    if (!deletingModel) return;
    setDeleteLoading(true);
    try {
      await spatialApi.deleteModel(deletingModel.id);
      setModels((prev) => prev.filter((m) => m.id !== deletingModel.id));
      setToastMessage(`Spatial model "${deletingModel.code}" deleted.`);
      setDeletingModel(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete spatial model.");
    } finally {
      setDeleteLoading(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // KPI stats
  const activeCount = React.useMemo(
    () => models.filter((m) => m.isActive).length,
    [models],
  );
  const proceduralCount = React.useMemo(
    () => models.filter((m) => (m.format || "PROCEDURAL") === "PROCEDURAL").length,
    [models],
  );
  const totalAnchors = React.useMemo(
    () =>
      models.reduce((sum, m) => sum + (Array.isArray(m.anchors) ? m.anchors.length : 0), 0),
    [models],
  );

  const columns: ColumnDef<SpatialModelDto>[] = [
    {
      accessorKey: "code",
      header: "Model Code",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-muted/60 border border-border flex items-center justify-center shrink-0">
            <Box className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div>
            <span className="font-mono font-medium text-foreground text-xs">
              {row.original.code}
            </span>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground text-xs">
            {row.original.name}
          </div>
          {row.original.metadata?.description ? (
            <div className="text-[11px] text-muted-foreground line-clamp-1">
              {String(row.original.metadata.description)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "format",
      header: "Format",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-medium border rounded bg-muted border-border">
          {row.original.format || "PROCEDURAL"}
        </span>
      ),
    },
    {
      id: "dimensions",
      header: () => <span className="font-mono">Dimensions (W × H × D mm)</span>,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.widthMm} × {row.original.heightMm} × {row.original.depthMm} mm
        </span>
      ),
    },
    {
      id: "anchorsCount",
      header: "Anchors",
      cell: ({ row }) => {
        const count = Array.isArray(row.original.anchors)
          ? row.original.anchors.length
          : 0;
        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-mono text-muted-foreground hover:text-foreground"
            onClick={() => setManagingAnchorsModel(row.original)}
          >
            <AnchorIcon className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            {count} {count === 1 ? "anchor" : "anchors"}
          </Button>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => <RecordStatusBadge isActive={row.original.isActive ?? true} />,
    },
    {
      id: "actions",
      header: () => <span className="text-right block w-full">Actions</span>,
      meta: {
        width: "12%",
        headerClassName: "text-right",
        cellClassName: "text-right",
      },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Manage anchors"
            aria-label="Manage anchors"
            onClick={() => setManagingAnchorsModel(row.original)}
          >
            <AnchorIcon className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Edit model"
            aria-label="Edit model"
            onClick={() => {
              setEditingModel(row.original);
              setIsModelFormOpen(true);
            }}
          >
            <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Delete model"
            aria-label="Delete model"
            onClick={() => setDeletingModel(row.original)}
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive/80" />
          </Button>
        </div>
      ),
    },
  ];

  const filterConfigs: FilterConfig[] = [
    {
      id: "format",
      label: "Format",
      options: [
        { label: "Procedural", value: "PROCEDURAL" },
        { label: "GLTF/GLB", value: "GLTF" },
      ],
    },
    {
      id: "isActive",
      label: "Status",
      options: [
        { label: "Active", value: "true" },
        { label: "Inactive", value: "false" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Spatial Models & Anchors"
        description="Configure parametric physical storage models, millimeter bounding dimensions, and compartment snap targets."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingModel(null);
              setIsModelFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Spatial Model
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Spatial Models"
          value={models.length}
          subtitle="Configured storage templates"
          icon={Box}
        />
        <StatCard
          title="Active Models"
          value={activeCount}
          subtitle="Available for location mapping"
          icon={CheckCircle2}
        />
        <StatCard
          title="Procedural Models"
          value={proceduralCount}
          subtitle="Parametric millimeter geometry"
          icon={FileCode}
        />
        <StatCard
          title="Total Spatial Anchors"
          value={totalAnchors}
          subtitle="Compartment snap points"
          icon={Layers}
        />
      </div>

      {toastMessage && (
        <div className="p-3 text-sm text-foreground bg-muted border border-border rounded-md animate-in fade-in">
          {toastMessage}
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      )}

      {/* Models Table */}
      <EntityDataTable
        data={models}
        columns={columns}
        filters={filterConfigs}
        searchPlaceholder="Search models by code or name..."
        isLoading={loading}
      />

      {/* Create / Edit Model Dialog */}
      <SpatialModelDialog
        open={isModelFormOpen}
        onOpenChange={(open) => {
          setIsModelFormOpen(open);
          if (!open) setEditingModel(null);
        }}
        model={editingModel}
        onSuccess={handleModelSaved}
      />

      {/* Manage Anchors Dialog */}
      <SpatialAnchorsDialog
        open={Boolean(managingAnchorsModel)}
        onOpenChange={(open) => {
          if (!open) setManagingAnchorsModel(null);
        }}
        model={managingAnchorsModel}
        onUpdated={() => {
          fetchModels();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingModel)}
        title="Delete Spatial Model"
        description={`Are you sure you want to delete spatial model "${deletingModel?.code}" (${deletingModel?.name})? Locations mapped to this model may lose their 2D/3D visualization.`}
        confirmText="Delete Model"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingModel(null)}
      />
    </div>
  );
}
