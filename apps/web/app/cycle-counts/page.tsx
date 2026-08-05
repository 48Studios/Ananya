"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  X,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  ClipboardCheck,
  User,
  MapPin,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CycleCountForm } from "@/components/cycle-counts/cycle-count-form";
import {
  cycleCountsApi,
  type CycleCountDto,
  type CycleCountStatus,
} from "@/lib/api/cycle-counts-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getStatusBadge(status: CycleCountStatus) {
  switch (status) {
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Approved & Reconciled
        </span>
      );
    case "REVIEW":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
          <FileCheck className="w-3 h-3 mr-1" />
          Under Review
        </span>
      );
    case "COUNTING":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
          <ClipboardCheck className="w-3 h-3 mr-1" />
          Counting
        </span>
      );
    case "ASSIGNED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <User className="w-3 h-3 mr-1" />
          Assigned
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

export default function CycleCountsPage() {
  const [cycleCounts, setCycleCounts] = React.useState<CycleCountDto[]>([]);
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [locationsList, setLocationsList] = React.useState<LocationDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingCount, setEditingCount] = React.useState<CycleCountDto | null>(
    null,
  );
  const [deletingCount, setDeletingCount] =
    React.useState<CycleCountDto | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchCycleCounts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [countsData, locs] = await Promise.all([
        cycleCountsApi.getAll(),
        locationsApi.getAll().catch(() => []),
      ]);
      setCycleCounts(countsData);
      setLocationsList(locs);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Cycle Counts list");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCycleCounts();
  }, [fetchCycleCounts]);

  const reviewCount = React.useMemo(
    () => cycleCounts.filter((c) => c.status === "REVIEW").length,
    [cycleCounts],
  );
  const approvedCount = React.useMemo(
    () => cycleCounts.filter((c) => c.status === "APPROVED").length,
    [cycleCounts],
  );
  const activeCountingCount = React.useMemo(
    () =>
      cycleCounts.filter(
        (c) => c.status === "COUNTING" || c.status === "ASSIGNED",
      ).length,
    [cycleCounts],
  );

  const handleDeleteConfirm = async () => {
    if (!deletingCount) return;
    try {
      await cycleCountsApi.delete(deletingCount.id);
      setToastMessage(`Cycle Count "${deletingCount.countNumber}" deleted.`);
      setDeletingCount(null);
      setTimeout(() => setToastMessage(null), 4000);
      fetchCycleCounts();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete cycle count",
      );
    }
  };

  const columns = React.useMemo<ColumnDef<CycleCountDto>[]>(
    () => [
      {
        accessorKey: "countNumber",
        header: "Count #",
        cell: ({ row }) => (
          <Link
            href={`/cycle-counts/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold"
          >
            {row.original.countNumber}
          </Link>
        ),
      },
      {
        accessorKey: "locationId",
        header: "Facility Location",
        cell: ({ row }) => {
          const loc = locationsMap[row.original.locationId];
          return (
            <span className="text-xs font-medium text-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3 text-muted-foreground" />
              {loc ? loc.name : row.original.locationId.slice(0, 8)}{" "}
              {loc && (
                <span className="font-mono text-muted-foreground text-[11px]">
                  ({loc.code})
                </span>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "assignedCounter",
        header: "Assigned Counter",
        cell: ({ row }) => (
          <span className="text-xs text-foreground flex items-center gap-1">
            <User className="w-3 h-3 text-muted-foreground" />
            {row.original.assignedCounter || "Unassigned"}
          </span>
        ),
      },
      {
        id: "lineCount",
        header: "Scope Items",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-foreground font-bold">
            {row.original.lines.length} items
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => getStatusBadge(row.original.status),
      },
      {
        accessorKey: "scheduledDate",
        header: "Scheduled Date",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground font-mono">
            {row.original.scheduledDate
              ? new Date(row.original.scheduledDate).toLocaleDateString()
              : "Unscheduled"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Link href={`/cycle-counts/${row.original.id}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                title="View details and review"
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
            {row.original.status === "DRAFT" && (
              <>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Edit draft scope"
                  onClick={() => {
                    setEditingCount(row.original);
                    setIsFormOpen(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Delete draft"
                  onClick={() => setDeletingCount(row.original)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive hover:text-destructive" />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [locationsMap],
  );

  const filterConfigs: FilterConfig[] = React.useMemo(
    () => [
      {
        columnId: "status",
        title: "Status",
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Assigned", value: "ASSIGNED" },
          { label: "Counting", value: "COUNTING" },
          { label: "Under Variance Review", value: "REVIEW" },
          { label: "Approved & Reconciled", value: "APPROVED" },
          { label: "Cancelled", value: "CANCELLED" },
        ],
      },
      {
        columnId: "locationId",
        title: "Location",
        options: locationsList.map((loc) => ({
          label: `${loc.code} — ${loc.name}`,
          value: loc.id,
        })),
      },
    ],
    [locationsList],
  );

  const handleFormSuccess = (saved: CycleCountDto) => {
    setToastMessage(`Cycle Count "${saved.countNumber}" saved.`);
    setIsFormOpen(false);
    setEditingCount(null);
    setTimeout(() => setToastMessage(null), 4000);
    fetchCycleCounts();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Cycle Counts"
        description="Periodic physical inventory verification, floor counting, and discrepancy reconciliation."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingCount(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Cycle Count
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Cycle Counts"
          value={cycleCounts.length}
          subtitle="Inventory verification jobs"
          icon={ClipboardCheck}
        />
        <StatCard
          title="Active Floor Counting"
          value={activeCountingCount}
          subtitle="Physical counting ongoing"
          icon={User}
        />
        <StatCard
          title="Under Variance Review"
          value={reviewCount}
          subtitle="Pending manager review"
          icon={FileCheck}
        />
        <StatCard
          title="Approved & Reconciled"
          value={approvedCount}
          subtitle="Stock adjustments posted"
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
          <Button variant="ghost" size="xs" onClick={fetchCycleCounts}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-foreground">
                {editingCount
                  ? "Edit Draft Cycle Count Scope"
                  : "Create Cycle Count Audit"}
              </h2>
              <button
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingCount(null);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <CycleCountForm
              initialData={editingCount}
              onSuccess={handleFormSuccess}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingCount(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingCount)}
        title="Delete Draft Cycle Count"
        description={`Are you sure you want to delete draft Cycle Count "${deletingCount?.countNumber}"?`}
        confirmText="Delete Count"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingCount(null)}
      />

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={cycleCounts}
        searchKey="countNumber"
        searchPlaceholder="Search by Count #, counter, or notes..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No Cycle Counts found"
        emptyMessage="Get started by scheduling your first periodic physical inventory cycle count."
      />
    </div>
  );
}
