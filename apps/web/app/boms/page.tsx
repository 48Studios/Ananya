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
  Boxes,
  Layers,
  Copy,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BomForm } from "@/components/boms/bom-form";
import {
  bomsApi,
  type BillOfMaterialsDto,
  type BomStatus,
} from "@/lib/api/boms-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";

function getStatusBadge(status: BomStatus) {
  switch (status) {
    case "RELEASED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Released
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Draft
        </span>
      );
    case "OBSOLETE":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border">
          <XCircle className="w-3 h-3 mr-1" />
          Obsolete
        </span>
      );
  }
}

export default function BomsPage() {
  const [boms, setBoms] = React.useState<BillOfMaterialsDto[]>([]);
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingBom, setEditingBom] = React.useState<BillOfMaterialsDto | null>(
    null,
  );
  const [deletingBom, setDeletingBom] =
    React.useState<BillOfMaterialsDto | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchBoms = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bomData, comps] = await Promise.all([
        bomsApi.getAll(),
        componentsApi.getAll().catch(() => []),
      ]);
      setBoms(bomData);

      const map: Record<string, ComponentDto> = {};
      for (const c of comps) map[c.id] = c;
      setComponentsMap(map);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Bill of Materials list");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBoms();
  }, [fetchBoms]);

  const activeReleasedCount = React.useMemo(
    () => boms.filter((b) => b.status === "RELEASED").length,
    [boms],
  );
  const draftCount = React.useMemo(
    () => boms.filter((b) => b.status === "DRAFT").length,
    [boms],
  );
  const obsoleteCount = React.useMemo(
    () => boms.filter((b) => b.status === "OBSOLETE").length,
    [boms],
  );

  const handleDuplicate = React.useCallback(
    async (bom: BillOfMaterialsDto) => {
      try {
        const dup = await bomsApi.duplicate(bom.id);
        setToastMessage(
          `Duplicated revision ${dup.revision} created as Draft.`,
        );
        setTimeout(() => setToastMessage(null), 4000);
        fetchBoms();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to duplicate BOM",
        );
      }
    },
    [fetchBoms],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingBom) return;
    try {
      await bomsApi.delete(deletingBom.id);
      setToastMessage(`BOM revision "${deletingBom.revision}" deleted.`);
      setDeletingBom(null);
      setTimeout(() => setToastMessage(null), 4000);
      fetchBoms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete BOM");
    }
  };

  const columns = React.useMemo<ColumnDef<BillOfMaterialsDto>[]>(
    () => [
      {
        accessorKey: "componentId",
        header: "Finished Product",
        cell: ({ row }) => {
          const comp = componentsMap[row.original.componentId];
          return (
            <Link
              href={`/boms/${row.original.id}`}
              className="text-xs font-semibold text-foreground hover:underline flex items-center gap-1.5"
            >
              <Boxes className="w-3.5 h-3.5 text-muted-foreground" />
              {comp ? comp.name : row.original.componentId.slice(0, 8)}{" "}
              {comp && (
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({comp.sku})
                </span>
              )}
            </Link>
          );
        },
      },
      {
        accessorKey: "revision",
        header: "Revision",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground bg-muted/50 px-2 py-0.5 rounded">
            {row.original.revision}
          </span>
        ),
      },
      {
        accessorKey: "lines",
        header: "Component Lines",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-foreground">
            {row.original.lines.length} components
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        accessorKey: "createdAt",
        header: "Date Created",
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
            <Link href={`/boms/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Duplicate revision"
              onClick={() => handleDuplicate(row.original)}
            >
              <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
            {row.original.status === "DRAFT" && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Edit draft"
                  onClick={() => {
                    setEditingBom(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete draft"
                  onClick={() => setDeletingBom(row.original)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [componentsMap, handleDuplicate],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Released (Active)", value: "RELEASED" },
        { label: "Draft", value: "DRAFT" },
        { label: "Obsolete", value: "OBSOLETE" },
      ],
    },
  ];

  const handleFormSuccess = (savedBom: BillOfMaterialsDto) => {
    setToastMessage(`BOM revision "${savedBom.revision}" saved successfully.`);
    setIsFormOpen(false);
    setEditingBom(null);
    setTimeout(() => setToastMessage(null), 4000);
    fetchBoms();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Bill of Materials (BOM)"
        description="Define component assembly requirements, revision history, and material structures for manufacturing work orders."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingBom(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New BOM
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Specifications"
          value={boms.length}
          subtitle="BOM Revisions"
          icon={Layers}
        />
        <StatCard
          title="Active Released"
          value={activeReleasedCount}
          subtitle="Production ready"
          icon={CheckCircle2}
        />
        <StatCard
          title="Draft Revisions"
          value={draftCount}
          subtitle="In preparation"
          icon={Clock}
        />
        <StatCard
          title="Obsolete / Archived"
          value={obsoleteCount}
          subtitle="Historical revisions"
          icon={XCircle}
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
          <Button variant="ghost" size="xs" onClick={fetchBoms}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Creation / Edit Modal Form */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingBom(null);
          }
        }}
        title={editingBom ? "Edit Draft BOM" : "Create Bill of Materials"}
        description={
          editingBom
            ? `Update draft BOM revision "${editingBom.revision}" before releasing it for production use.`
            : "Create a bill of materials with a finished product, revision, and required component structure."
        }
        size="sm"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <BomForm
            initialData={editingBom}
            onSuccess={handleFormSuccess}
            onCancel={() => {
              setIsFormOpen(false);
              setEditingBom(null);
            }}
          />
        </div>
      </DialogShell>

      {/* Confirmation Dialog for Deleting */}
      <ConfirmDialog
        isOpen={Boolean(deletingBom)}
        title="Delete Draft BOM"
        description={`Are you sure you want to delete draft BOM revision "${deletingBom?.revision}"?`}
        confirmText="Delete BOM"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingBom(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={boms}
        searchKey="revision"
        searchPlaceholder="Search by revision or notes..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Bill of Materials found"
        emptyMessage="Get started by creating your first manufacturing assembly specification."
      />
    </div>
  );
}
