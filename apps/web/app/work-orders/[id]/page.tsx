"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  Wrench,
  CheckCircle2,
  Clock,
  XCircle,
  Play,
  Pause,
  MapPin,
  Pencil,
  Trash2,
  Calendar,
  AlertTriangle,
  Activity,
  Package,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { WorkOrderForm } from "@/components/work-orders/work-order-form";
import { RecordOutputModal } from "@/components/work-orders/record-output-modal";
import { RecordScrapModal } from "@/components/work-orders/record-scrap-modal";
import {
  workOrdersApi,
  type WorkOrderDto,
  type WorkOrderStatus,
  type WorkOrderPriority,
  type MaterialRequirementDetailDto,
  type ProductionActivityItemDto,
} from "@/lib/api/work-orders-api";
import { bomsApi, type BillOfMaterialsDto } from "@/lib/api/boms-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";
import {
  inventoryTransactionsApi,
  type InventoryTransactionDto,
} from "@/lib/api/inventory-transactions-api";

function getStatusBadge(status: WorkOrderStatus) {
  switch (status) {
    case "COMPLETED":
    case "CLOSED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          COMPLETED
        </span>
      );
    case "IN_PROGRESS":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <Play className="w-3 h-3 mr-1 text-blue-600 animate-pulse" />
          IN PROGRESS
        </span>
      );
    case "PAUSED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Pause className="w-3 h-3 mr-1" />
          PAUSED
        </span>
      );
    case "RELEASED":
    case "MATERIAL_ALLOCATED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
          <Clock className="w-3 h-3 mr-1" />
          RELEASED
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          <Clock className="w-3 h-3 mr-1" />
          DRAFT
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

function getPriorityBadge(priority: WorkOrderPriority) {
  switch (priority) {
    case "URGENT":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
          URGENT
        </span>
      );
    case "HIGH":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          HIGH
        </span>
      );
    case "NORMAL":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          NORMAL
        </span>
      );
    case "LOW":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-slate-500/10 text-slate-700 dark:text-slate-400 border border-slate-500/20">
          LOW
        </span>
      );
  }
}

export default function ViewWorkOrderPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [wo, setWo] = React.useState<WorkOrderDto | null>(null);
  const [productComp, setProductComp] = React.useState<ComponentDto | null>(
    null,
  );
  const [bom, setBom] = React.useState<BillOfMaterialsDto | null>(null);
  const [location, setLocation] = React.useState<LocationDto | null>(null);
  const [materials, setMaterials] = React.useState<
    MaterialRequirementDetailDto[]
  >([]);
  const [timeline, setTimeline] = React.useState<ProductionActivityItemDto[]>(
    [],
  );
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});
  const [linkedTransactions, setLinkedTransactions] = React.useState<
    InventoryTransactionDto[]
  >([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isOutputModalOpen, setIsOutputModalOpen] = React.useState(false);
  const [isScrapModalOpen, setIsScrapModalOpen] = React.useState(false);

  const [isReleasing, setIsReleasing] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isPausing, setIsPausing] = React.useState(false);
  const [isResuming, setIsResuming] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [showReleaseDialog, setShowReleaseDialog] = React.useState(false);
  const [showStartDialog, setShowStartDialog] = React.useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const woData = await workOrdersApi.getById(id);
      setWo(woData);

      const [pComp, bomData, locData, matReqs, activityItems, comps, txs] =
        await Promise.all([
          componentsApi.getById(woData.componentId).catch(() => null),
          bomsApi.getById(woData.bomId).catch(() => null),
          woData.locationId
            ? locationsApi.getById(woData.locationId).catch(() => null)
            : Promise.resolve(null),
          workOrdersApi.getMaterialRequirements(id).catch(() => []),
          workOrdersApi.getTimeline(id).catch(() => []),
          componentsApi.getAll().catch(() => []),
          inventoryTransactionsApi.getAll().catch(() => []),
        ]);

      if (pComp) setProductComp(pComp);
      if (bomData) setBom(bomData);
      if (locData) setLocation(locData);
      setMaterials(matReqs);
      setTimeline(activityItems);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);

      const woTxs = txs.filter((t) => t.reference === woData.productionNumber);
      setLinkedTransactions(woTxs);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load Work Order details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRelease = async () => {
    if (!wo) return;
    setIsReleasing(true);
    try {
      const updated = await workOrdersApi.release(wo.id);
      setWo(updated);
      setShowReleaseDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to release Work Order",
      );
    } finally {
      setIsReleasing(false);
    }
  };

  const handleStart = async () => {
    if (!wo) return;
    setIsStarting(true);
    try {
      const updated = await workOrdersApi.start(wo.id);
      setWo(updated);
      setShowStartDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to start production",
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handlePause = async () => {
    if (!wo) return;
    setIsPausing(true);
    try {
      const updated = await workOrdersApi.pause(wo.id);
      setWo(updated);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to pause production",
      );
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    if (!wo) return;
    setIsResuming(true);
    try {
      const updated = await workOrdersApi.resume(wo.id);
      setWo(updated);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to resume production",
      );
    } finally {
      setIsResuming(false);
    }
  };

  const handleComplete = async () => {
    if (!wo) return;
    setIsCompleting(true);
    try {
      const updated = await workOrdersApi.complete(wo.id);
      setWo(updated);
      setShowCompleteDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to complete Work Order",
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const handleCancel = async () => {
    if (!wo) return;
    setIsCancelling(true);
    try {
      const updated = await workOrdersApi.cancel(wo.id);
      setWo(updated);
      setShowCancelDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel Work Order",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!wo) return;
    setIsDeleting(true);
    try {
      await workOrdersApi.delete(wo.id);
      router.push("/work-orders");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete Work Order",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading Production Execution Dashboard..." />;
  }

  if (error || !wo) {
    return (
      <ErrorState
        title="Work Order Not Found"
        message={error || "The requested Work Order record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  const progressPercent =
    wo.quantityPlanned > 0
      ? Math.min(
          100,
          Math.round((wo.quantityCompleted / wo.quantityPlanned) * 100),
        )
      : 0;
  const remainingUnits = Math.max(0, wo.quantityPlanned - wo.quantityCompleted);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={`Production Execution — ${wo.productionNumber}`}
        description={`Product: ${productComp ? productComp.name : wo.componentId}`}
        breadcrumbs={[
          { label: "Work Orders", href: "/work-orders" },
          { label: wo.productionNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/work-orders")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report
            </Button>

            {wo.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
                <Button size="sm" onClick={() => setShowReleaseDialog(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Release Order
                </Button>
              </>
            )}

            {(wo.status === "RELEASED" ||
              wo.status === "MATERIAL_ALLOCATED") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={() => setShowStartDialog(true)}>
                  <Play className="w-4 h-4 mr-1.5" />
                  Start Production
                </Button>
              </>
            )}

            {wo.status === "PAUSED" && (
              <Button size="sm" onClick={handleResume} disabled={isResuming}>
                <Play className="w-4 h-4 mr-1.5" />
                Resume Production
              </Button>
            )}

            {wo.status === "IN_PROGRESS" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePause}
                  disabled={isPausing}
                >
                  <Pause className="w-4 h-4 mr-1.5" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsScrapModalOpen(true)}
                  className="text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                >
                  <AlertTriangle className="w-4 h-4 mr-1.5" />
                  Record Scrap
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsOutputModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Package className="w-4 h-4 mr-1.5" />
                  Record Output Batch
                </Button>
                <Button size="sm" onClick={() => setShowCompleteDialog(true)}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Complete Production
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Modals */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Draft Work Order"
        description="Update production quantity, target completion date, or BOM revision."
        size="xl"
      >
        <WorkOrderForm
          initialData={wo}
          onSuccess={(updated) => {
            setWo(updated);
            setIsEditOpen(false);
            fetchData();
          }}
          onCancel={() => setIsEditOpen(false)}
        />
      </DialogShell>

      {isOutputModalOpen && (
        <RecordOutputModal
          isOpen={isOutputModalOpen}
          workOrder={wo}
          onSuccess={(updated) => {
            setWo(updated);
            setIsOutputModalOpen(false);
            fetchData();
          }}
          onClose={() => setIsOutputModalOpen(false)}
        />
      )}

      {isScrapModalOpen && (
        <RecordScrapModal
          isOpen={isScrapModalOpen}
          workOrder={wo}
          materials={materials}
          onSuccess={(updated) => {
            setWo(updated);
            setIsScrapModalOpen(false);
            fetchData();
          }}
          onClose={() => setIsScrapModalOpen(false)}
        />
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title="Planned Quantity"
          value={`${wo.quantityPlanned} units`}
          subtitle="Target manufacturing output"
          icon={Wrench}
        />
        <StatCard
          title="Completed Goods"
          value={`${wo.quantityCompleted} units`}
          subtitle={`Progress: ${progressPercent}%`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Remaining Units"
          value={`${remainingUnits} units`}
          subtitle={
            remainingUnits === 0 ? "Production complete" : "To be manufactured"
          }
          icon={Package}
        />
        <StatCard
          title="Scrapped Units"
          value={`${wo.quantityScrapped} units`}
          subtitle="Defective / scrapped items"
          icon={AlertTriangle}
        />
      </div>

      {/* Work Order Summary & Progress Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Work Order Summary Card */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Work Order Summary
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Executable job specification, location, and priority parameters.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {getPriorityBadge(wo.priority)}
              {getStatusBadge(wo.status)}
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Work Order #
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {wo.productionNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Finished Product
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {productComp ? (
                  <Link
                    href={`/components/${productComp.id}`}
                    className="hover:underline flex items-center gap-1"
                  >
                    <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                    {productComp.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({productComp.sku})
                    </span>
                  </Link>
                ) : (
                  wo.componentId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                BOM Revision
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {bom ? (
                  <Link
                    href={`/boms/${bom.id}`}
                    className="hover:underline font-mono text-xs text-primary"
                  >
                    BOM {bom.revision}
                  </Link>
                ) : (
                  wo.bomId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Production Location
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {location ? (
                  <Link
                    href={`/locations/${location.id}`}
                    className="hover:underline flex items-center gap-1"
                  >
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    {location.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      ({location.code})
                    </span>
                  </Link>
                ) : (
                  "Not assigned"
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Planned Start Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {wo.startDate
                  ? new Date(wo.startDate).toLocaleDateString()
                  : "Not scheduled"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Planned Completion Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {wo.endDate
                  ? new Date(wo.endDate).toLocaleDateString()
                  : "Not scheduled"}
              </dd>
            </div>
          </dl>

          {wo.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Production Notes
              </span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {wo.notes}
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Operator / Created By: {wo.createdBy || "SYSTEM"}</span>
            <span>Created: {new Date(wo.createdAt).toLocaleString()}</span>
          </div>
        </div>

        {/* Production Progress Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">
            Production Progress
          </h3>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-muted-foreground font-semibold">
                Yield Completion
              </span>
              <span className="font-mono font-bold text-foreground">
                {progressPercent}%
              </span>
            </div>
            <div className="w-full h-3.5 bg-muted/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 text-xs">
            <div className="flex justify-between p-2.5 bg-muted/30 border border-border rounded-lg">
              <span className="text-muted-foreground">Units Planned:</span>
              <span className="font-mono font-bold text-foreground">
                {wo.quantityPlanned}
              </span>
            </div>
            <div className="flex justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-700 dark:text-emerald-400">
              <span className="font-medium">Units Completed:</span>
              <span className="font-mono font-bold">
                {wo.quantityCompleted}
              </span>
            </div>
            <div className="flex justify-between p-2.5 bg-muted/30 border border-border rounded-lg">
              <span className="text-muted-foreground">Units Remaining:</span>
              <span className="font-mono font-bold text-foreground">
                {remainingUnits}
              </span>
            </div>
            <div className="flex justify-between p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-400">
              <span className="font-medium">Units Scrapped:</span>
              <span className="font-mono font-bold">{wo.quantityScrapped}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Material Requirements Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Material Requirements & Consumption ({materials.length} Raw
            Materials)
          </h3>
          <span className="text-xs text-muted-foreground">
            Auto-derived from BOM {bom?.revision || "Specification"}
          </span>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Component Raw Item</th>
                <th className="p-3 text-right">Required Qty</th>
                <th className="p-3 text-right">Reserved Qty</th>
                <th className="p-3 text-right">Consumed Qty</th>
                <th className="p-3 text-right">Remaining Qty</th>
                <th className="p-3 text-right">Current Stock</th>
                <th className="p-3">Shortage Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.map((mat, idx) => {
                const comp = componentsMap[mat.componentId];
                return (
                  <tr
                    key={mat.componentId}
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
                        <span className="font-mono">{mat.componentId}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {mat.requiredQuantity} {mat.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {mat.reservedQuantity} {mat.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                      {mat.consumedQuantity} {mat.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono text-muted-foreground">
                      {mat.remainingQuantity} {mat.unitOfMeasure}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {mat.availableQuantity} {mat.unitOfMeasure}
                    </td>
                    <td className="p-3">
                      {mat.isShortage ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Shortage
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Available
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Production Activity Timeline */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              Production Execution Activity Timeline ({timeline.length} Events)
            </h3>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            Immutable Audit Trail
          </span>
        </div>

        {timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 bg-muted/20 border border-border rounded-lg text-center">
            No production execution activity recorded yet. Start production or
            record output batches to populate the timeline.
          </p>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {timeline.map((evt) => (
              <div key={evt.id} className="relative group">
                <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-background border-2 border-primary group-hover:scale-110 transition-transform" />
                <div className="bg-muted/20 border border-border rounded-lg p-3.5 space-y-1 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      {evt.title}
                      {evt.quantity !== undefined && (
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {evt.quantity} {evt.unitOfMeasure || "pcs"}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {evt.description}
                  </p>
                  {evt.createdBy && (
                    <span className="text-[10px] text-muted-foreground font-mono block pt-1">
                      By: {evt.createdBy}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Linked Inventory Transactions Audit Card */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Inventory Ledger Transactions ({linkedTransactions.length} Posted
            Entries)
          </h3>
          <Link
            href="/transactions"
            className="text-xs text-primary hover:underline font-medium"
          >
            View Ledger →
          </Link>
        </div>

        {linkedTransactions.length === 0 ? (
          <p className="text-xs text-muted-foreground p-4 bg-muted/20 border border-border rounded-lg text-center">
            No inventory transactions posted yet.
          </p>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Component</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linkedTransactions.map((tx) => {
                  const comp = componentsMap[tx.componentId];
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3">
                        <span className="font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-0.5 rounded">
                          {tx.transactionType}
                        </span>
                      </td>
                      <td className="p-3 font-medium">
                        {comp ? comp.name : tx.componentId}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {tx.sourceLocationId ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            -{tx.quantity}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{tx.quantity}
                          </span>
                        )}{" "}
                        {tx.unitOfMeasure}
                      </td>
                      <td className="p-3 text-muted-foreground">{tx.reason}</td>
                      <td className="p-3 text-right text-muted-foreground font-mono">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showReleaseDialog}
        title="Release Work Order"
        description={`Are you sure you want to release Work Order "${wo.productionNumber}" for production scheduling?`}
        confirmText="Release Order"
        loading={isReleasing}
        variant="default"
        onConfirm={handleRelease}
        onCancel={() => setShowReleaseDialog(false)}
      />

      <ConfirmDialog
        isOpen={showStartDialog}
        title="Start Production Job"
        description={`Are you sure you want to start production for Work Order "${wo.productionNumber}"?`}
        confirmText="Start Production"
        loading={isStarting}
        variant="default"
        onConfirm={handleStart}
        onCancel={() => setShowStartDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCompleteDialog}
        title="Complete Production & Post Output"
        description={`Are you sure you want to mark Work Order "${wo.productionNumber}" as COMPLETED? Remaining finished goods output will be posted to the Inventory Ledger.`}
        confirmText="Complete Production"
        loading={isCompleting}
        variant="default"
        onConfirm={handleComplete}
        onCancel={() => setShowCompleteDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Work Order"
        description={`Are you sure you want to cancel Work Order "${wo.productionNumber}"?`}
        confirmText="Cancel Work Order"
        loading={isCancelling}
        variant="destructive"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Draft Work Order"
        description={`Are you sure you want to permanently delete draft Work Order "${wo.productionNumber}"?`}
        confirmText="Delete Work Order"
        loading={isDeleting}
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
