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
  Wrench,
  Play,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
  MapPin,
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
import { WorkOrderForm } from "@/components/work-orders/work-order-form";
import {
  workOrdersApi,
  type WorkOrderDto,
  type WorkOrderStatus,
  type WorkOrderPriority,
} from "@/lib/api/work-orders-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import { bomsApi, type BillOfMaterialsDto } from "@/lib/api/boms-api";

function getStatusBadge(status: WorkOrderStatus) {
  switch (status) {
    case "COMPLETED":
    case "CLOSED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Completed
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <Play className="w-3 h-3 mr-1" />
          In Progress
        </span>
      );
    case "RELEASED":
    case "MATERIAL_ALLOCATED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Released
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Draft
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

function getPriorityBadge(priority: WorkOrderPriority) {
  switch (priority) {
    case "URGENT":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          URGENT
        </span>
      );
    case "HIGH":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          HIGH
        </span>
      );
    case "NORMAL":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          NORMAL
        </span>
      );
    case "LOW":
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          LOW
        </span>
      );
  }
}

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = React.useState<WorkOrderDto[]>([]);
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [bomsMap, setBomsMap] = React.useState<
    Record<string, BillOfMaterialsDto>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingWo, setEditingWo] = React.useState<WorkOrderDto | null>(null);
  const [deletingWo, setDeletingWo] = React.useState<WorkOrderDto | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchWorkOrders = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [woData, comps, locs, bomData] = await Promise.all([
        workOrdersApi.getAll(),
        componentsApi.getAll().catch(() => []),
        locationsApi.getAll().catch(() => []),
        bomsApi.getAll().catch(() => []),
      ]);
      setWorkOrders(woData);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);

      const bMap: Record<string, BillOfMaterialsDto> = {};
      for (const b of bomData) bMap[b.id] = b;
      setBomsMap(bMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Work Orders list");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders]);

  const inProgressCount = React.useMemo(
    () => workOrders.filter((w) => w.status === "IN_PROGRESS").length,
    [workOrders],
  );
  const releasedCount = React.useMemo(
    () =>
      workOrders.filter(
        (w) => w.status === "RELEASED" || w.status === "MATERIAL_ALLOCATED",
      ).length,
    [workOrders],
  );
  const completedCount = React.useMemo(
    () =>
      workOrders.filter(
        (w) => w.status === "COMPLETED" || w.status === "CLOSED",
      ).length,
    [workOrders],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingWo) return;
    try {
      await workOrdersApi.delete(deletingWo.id);
      setToastMessage(`Work Order "${deletingWo.productionNumber}" deleted.`);
      setDeletingWo(null);
      setTimeout(() => setToastMessage(null), 4000);
      fetchWorkOrders();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete Work Order",
      );
    }
  };

  const columns = React.useMemo<ColumnDef<WorkOrderDto>[]>(
    () => [
      {
        accessorKey: "productionNumber",
        header: "Work Order #",
        cell: ({ row }) => (
          <Link
            href={`/work-orders/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold"
          >
            {row.original.productionNumber}
          </Link>
        ),
      },
      {
        accessorKey: "componentId",
        header: "Finished Product",
        cell: ({ row }) => {
          const comp = componentsMap[row.original.componentId];
          return (
            <span className="text-xs font-medium text-foreground flex items-center gap-1">
              <Wrench className="w-3 h-3 text-muted-foreground" />
              {comp ? comp.name : row.original.componentId.slice(0, 8)}{" "}
              {comp && (
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({comp.sku})
                </span>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "bomId",
        header: "BOM Revision",
        cell: ({ row }) => {
          const bom = bomsMap[row.original.bomId];
          return (
            <span className="font-mono text-xs text-foreground">
              {bom ? `BOM ${bom.revision}` : row.original.bomId.slice(0, 8)}
            </span>
          );
        },
      },
      {
        accessorKey: "quantityPlanned",
        header: "Planned Qty",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-foreground">
            {row.original.quantityPlanned} units
          </span>
        ),
      },
      {
        accessorKey: "locationId",
        header: "Location",
        cell: ({ row }) => {
          const loc = row.original.locationId
            ? locationsMap[row.original.locationId]
            : null;
          return (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {loc ? loc.code : "—"}
            </span>
          );
        },
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
            <Link href={`/work-orders/${row.original.id}`}>
              <Button variant="ghost" size="icon-xs" title="View order details">
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            {row.original.status === "DRAFT" && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Edit draft"
                  onClick={() => {
                    setEditingWo(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete draft"
                  onClick={() => setDeletingWo(row.original)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [componentsMap, locationsMap, bomsMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "In Progress", value: "IN_PROGRESS" },
        { label: "Released", value: "RELEASED" },
        { label: "Draft", value: "DRAFT" },
        { label: "Completed", value: "COMPLETED" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
    },
    {
      columnId: "priority",
      title: "Priority",
      options: [
        { label: "Urgent", value: "URGENT" },
        { label: "High", value: "HIGH" },
        { label: "Normal", value: "NORMAL" },
        { label: "Low", value: "LOW" },
      ],
    },
  ];

  const handleFormSuccess = (savedWo: WorkOrderDto) => {
    setToastMessage(
      `Work Order "${savedWo.productionNumber}" saved successfully.`,
    );
    setIsFormOpen(false);
    setEditingWo(null);
    setTimeout(() => setToastMessage(null), 4000);
    fetchWorkOrders();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Work Orders"
        description="Executable manufacturing production jobs, material requirement planning, and inventory output tracking."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingWo(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Work Order
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Work Orders"
          value={workOrders.length}
          subtitle="Production jobs"
          icon={Wrench}
        />
        <StatCard
          title="In Progress Jobs"
          value={inProgressCount}
          subtitle="Active on floor"
          icon={Play}
        />
        <StatCard
          title="Released / Scheduled"
          value={releasedCount}
          subtitle="Ready to start"
          icon={Clock}
        />
        <StatCard
          title="Completed Jobs"
          value={completedCount}
          subtitle="Output posted"
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
          <Button variant="ghost" size="xs" onClick={fetchWorkOrders}>
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
            setEditingWo(null);
          }
        }}
        title={editingWo ? "Edit Draft Work Order" : "Create Work Order"}
        description={
          editingWo
            ? `Update draft work order "${editingWo.productionNumber}" using the standardized manufacturing dialog shell.`
            : "Create a new work order with a fixed header, scrollable body, and shared footer actions."
        }
        size="lg"
      >
        <WorkOrderForm
          initialData={editingWo}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingWo(null);
          }}
        />
      </DialogShell>

      {/* Confirmation Dialog for Deleting */}
      <ConfirmDialog
        isOpen={Boolean(deletingWo)}
        title="Delete Draft Work Order"
        description={`Are you sure you want to delete draft Work Order "${deletingWo?.productionNumber}"?`}
        confirmText="Delete Work Order"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingWo(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={workOrders}
        searchKey="productionNumber"
        searchPlaceholder="Search by Work Order # or notes..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Work Orders found"
        emptyMessage="Get started by creating your first manufacturing production job."
      />
    </div>
  );
}
