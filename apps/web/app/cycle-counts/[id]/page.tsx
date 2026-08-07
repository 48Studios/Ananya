"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  XCircle,
  MapPin,
  Pencil,
  Trash2,
  Calendar,
  Layers,
  User,
  Send,
  AlertTriangle,
  FileCheck,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { CycleCountForm } from "@/components/cycle-counts/cycle-count-form";
import { RecordCountsModal } from "@/components/cycle-counts/record-counts-modal";
import {
  cycleCountsApi,
  type CycleCountDto,
  type CycleCountStatus,
  type DiscrepancySummaryDto,
} from "@/lib/api/cycle-counts-api";
import { componentsApi, type ComponentDto } from "@/lib/api/components-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getStatusBadge(status: CycleCountStatus) {
  switch (status) {
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          APPROVED & RECONCILED
        </span>
      );
    case "REVIEW":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
          <FileCheck className="w-3 h-3 mr-1" />
          UNDER VARIANCE REVIEW
        </span>
      );
    case "COUNTING":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <ClipboardCheck className="w-3 h-3 mr-1" />
          COUNTING IN PROGRESS
        </span>
      );
    case "ASSIGNED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <User className="w-3 h-3 mr-1" />
          ASSIGNED TO COUNTER
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

export default function ViewCycleCountPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [cycleCount, setCycleCount] = React.useState<CycleCountDto | null>(
    null,
  );
  const [summary, setSummary] = React.useState<DiscrepancySummaryDto | null>(
    null,
  );
  const [location, setLocation] = React.useState<LocationDto | null>(null);
  const [componentsMap, setComponentsMap] = React.useState<
    Record<string, ComponentDto>
  >({});

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = React.useState(false);

  const [isStarting, setIsStarting] = React.useState(false);
  const [isApproving, setIsApproving] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const [showApproveDialog, setShowApproveDialog] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await cycleCountsApi.getById(id);
      setCycleCount(data);

      const [loc, sum, comps] = await Promise.all([
        locationsApi.getById(data.locationId).catch(() => null),
        cycleCountsApi.getSummary(id).catch(() => null),
        componentsApi.getAll().catch(() => []),
      ]);

      if (loc) setLocation(loc);
      if (sum) setSummary(sum);

      const compMap: Record<string, ComponentDto> = {};
      for (const c of comps) compMap[c.id] = c;
      setComponentsMap(compMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load Cycle Count details");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStartCounting = async () => {
    if (!cycleCount) return;
    setIsStarting(true);
    try {
      const updated = await cycleCountsApi.startCounting(cycleCount.id);
      setCycleCount(updated);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start counting");
    } finally {
      setIsStarting(false);
    }
  };

  const handleApprove = async () => {
    if (!cycleCount) return;
    setIsApproving(true);
    try {
      const updated = await cycleCountsApi.approve(
        cycleCount.id,
        "AUDIT_MANAGER",
      );
      setCycleCount(updated);
      setShowApproveDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to approve cycle count",
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleCancel = async () => {
    if (!cycleCount) return;
    setIsCancelling(true);
    try {
      const updated = await cycleCountsApi.cancel(cycleCount.id);
      setCycleCount(updated);
      setShowCancelDialog(false);
      fetchData();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel cycle count",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!cycleCount) return;
    setIsDeleting(true);
    try {
      await cycleCountsApi.delete(cycleCount.id);
      router.push("/cycle-counts");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete cycle count",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading Cycle Count details..." />;
  }

  if (error || !cycleCount) {
    return (
      <ErrorState
        title="Cycle Count Not Found"
        message={error || "The requested Cycle Count record does not exist."}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <PageHeader
        title={cycleCount.countNumber}
        description={`Physical Stock Count: ${location ? location.name : cycleCount.locationId}`}
        breadcrumbs={[
          { label: "Cycle Counts", href: "/cycle-counts" },
          { label: cycleCount.countNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/cycle-counts")}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" />
              Print Report
            </Button>

            {cycleCount.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Scope
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleStartCounting()}
                  disabled={isStarting}
                >
                  <Send className="w-4 h-4 mr-1.5" />
                  Start Physical Count
                </Button>
              </>
            )}

            {(cycleCount.status === "ASSIGNED" ||
              cycleCount.status === "COUNTING") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel Count
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsRecordModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ClipboardCheck className="w-4 h-4 mr-1.5" />
                  Record Physical Counts
                </Button>
              </>
            )}

            {cycleCount.status === "REVIEW" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRecordModalOpen(true)}
                >
                  <Pencil className="w-4 h-4 mr-1.5" />
                  Edit Physical Counts
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel Count
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowApproveDialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Approve & Reconcile Stock
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Edit Form Modal */}
      <DialogShell
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Draft Cycle Count"
        description={`Update draft cycle count "${cycleCount.countNumber}" before assigning or starting the physical count.`}
        size="sm"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <CycleCountForm
            initialData={cycleCount}
            onSuccess={(updated) => {
              setCycleCount(updated);
              setIsEditOpen(false);
              fetchData();
            }}
            onCancel={() => setIsEditOpen(false)}
          />
        </div>
      </DialogShell>

      {/* Record Physical Counts Modal */}
      <RecordCountsModal
        isOpen={isRecordModalOpen}
        cycleCount={cycleCount}
        onSuccess={(updated) => {
          setCycleCount(updated);
          setIsRecordModalOpen(false);
          fetchData();
        }}
        onClose={() => setIsRecordModalOpen(false)}
      />

      {/* Discrepancy Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        <StatCard
          title="Total Items Counted"
          value={summary?.totalItemsCounted ?? cycleCount.lines.length}
          subtitle="Audit component scope"
          icon={Layers}
        />
        <StatCard
          title="Matching Items"
          value={summary?.matchingItems ?? 0}
          subtitle="Zero variance"
          icon={CheckCircle2}
        />
        <StatCard
          title="Shortage Items"
          value={summary?.shortageItems ?? 0}
          subtitle="Physical < System"
          icon={AlertTriangle}
        />
        <StatCard
          title="Surplus Items"
          value={summary?.surplusItems ?? 0}
          subtitle="Physical > System"
          icon={FileCheck}
        />
        <StatCard
          title="Total Net Difference"
          value={`${summary?.totalQuantityDifference ?? 0} units`}
          subtitle="Net inventory drift"
          icon={ClipboardCheck}
        />
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Header Metadata */}
        <div className="md:col-span-2 bg-card border border-border rounded-xl p-6 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Cycle Count Specification
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Physical inventory audit and discrepancy analysis schedule.
              </p>
            </div>
            <div>{getStatusBadge(cycleCount.status)}</div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Count Number
              </dt>
              <dd className="mt-1 font-mono text-xs font-bold text-foreground bg-muted/40 px-2 py-1 rounded inline-block uppercase">
                {cycleCount.countNumber}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Facility / Location
              </dt>
              <dd className="mt-1 font-medium text-foreground">
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
                  cycleCount.locationId
                )}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Assigned Counter Specialist
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {cycleCount.assignedCounter || "Unassigned"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Scheduled Count Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {cycleCount.scheduledDate
                  ? new Date(cycleCount.scheduledDate).toLocaleDateString()
                  : "Not set"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Count Execution Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                {cycleCount.completedAt
                  ? new Date(cycleCount.completedAt).toLocaleString()
                  : "Pending physical count"}
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                Reconciliation Approval Date
              </dt>
              <dd className="mt-1 text-sm text-foreground flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                {cycleCount.approvedAt
                  ? new Date(cycleCount.approvedAt).toLocaleString()
                  : "Pending manager review"}
              </dd>
            </div>
          </dl>

          {cycleCount.notes && (
            <div className="pt-4 border-t border-border space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Audit Notes & Scope
              </span>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-lg border border-border">
                {cycleCount.notes}
              </p>
            </div>
          )}

          {cycleCount.stockAdjustmentId && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
                  Stock Adjustment document generated on approval.
                </span>
              </div>
              <Link
                href={`/stock-adjustments/${cycleCount.stockAdjustmentId}`}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1"
              >
                View Stock Adjustment <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          )}

          <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Created By: {cycleCount.createdBy || "SYSTEM"}</span>
            <span>Approved By: {cycleCount.approvedBy || "Pending"}</span>
          </div>
        </div>

        {/* Audit Instructions Card */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-semibold text-foreground">
            Audit Workflow
          </h3>

          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-slate-500/20 text-slate-700 dark:text-slate-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                1
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Schedule & Scope
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Target components assigned
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  ["COUNTING", "REVIEW", "APPROVED"].includes(cycleCount.status)
                    ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                2
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Physical Floor Count
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Actual floor stock entered
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  ["REVIEW", "APPROVED"].includes(cycleCount.status)
                    ? "bg-purple-500/20 text-purple-700 dark:text-purple-400 font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                3
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Variance Review
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Inspect Shortage/Surplus
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  cycleCount.status === "APPROVED"
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                4
              </div>
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">
                  Reconcile & Ledger
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Generate Stock Adjustment
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Count Lines Table */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Cycle Count Lines & Variance Analysis ({cycleCount.lines.length}{" "}
            Items)
          </h3>
          {["ASSIGNED", "COUNTING", "REVIEW"].includes(cycleCount.status) && (
            <Button
              size="xs"
              onClick={() => setIsRecordModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <ClipboardCheck className="w-3.5 h-3.5 mr-1" />
              Record / Edit Physical Counts
            </Button>
          )}
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Component Item</th>
                <th className="p-3 text-right">Expected System Qty</th>
                <th className="p-3 text-right">Actual Counted Qty</th>
                <th className="p-3 text-right">Variance</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Discrepancy Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cycleCount.lines.map((line, idx) => {
                const comp = componentsMap[line.componentId];
                return (
                  <tr
                    key={line.id}
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
                        <span className="font-mono">{line.componentId}</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {line.systemQuantity}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {line.countedQuantity}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      {line.variance === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : line.variance < 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">
                          {line.variance}
                        </span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400">
                          +{line.variance}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">
                      {line.unitOfMeasure}
                    </td>
                    <td className="p-3">
                      {line.variance === 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          MATCHING
                        </span>
                      ) : line.variance < 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400">
                          SHORTAGE ({Math.abs(line.variance)})
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400">
                          SURPLUS (+{line.variance})
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

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showApproveDialog}
        title="Approve Cycle Count & Reconcile Stock"
        description={`Are you sure you want to approve Cycle Count "${cycleCount.countNumber}"? Discrepancies will generate an automated Stock Adjustment and post immutable Inventory Ledger transactions.`}
        confirmText="Approve & Reconcile"
        loading={isApproving}
        variant="default"
        onConfirm={handleApprove}
        onCancel={() => setShowApproveDialog(false)}
      />

      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Cycle Count Audit"
        description={`Are you sure you want to cancel Cycle Count "${cycleCount.countNumber}"?`}
        confirmText="Cancel Count"
        loading={isCancelling}
        variant="destructive"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Draft Cycle Count"
        description={`Are you sure you want to permanently delete draft Cycle Count "${cycleCount.countNumber}"?`}
        confirmText="Delete Count"
        loading={isDeleting}
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
