"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ClipboardCheck,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogShell } from "@/components/ui/dialog-shell";
import { CycleCountForm } from "@/components/cycle-counts/cycle-count-form";
import { cycleCountsApi, type CycleCountDto } from "@/lib/api/cycle-counts-api";
import { formatDate } from "@/lib/utils";

export default function StockCountsPage() {
  const [counts, setCounts] = React.useState<CycleCountDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [deletingCount, setDeletingCount] =
    React.useState<CycleCountDto | null>(null);
  const [banner, setBanner] = React.useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const fetchCounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await cycleCountsApi.getAll();
      setCounts(data || []);
    } catch (err: unknown) {
      setBanner({
        message:
          err instanceof Error ? err.message : "Failed to load stock audits",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const showBanner = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setBanner({ message, type });
    setTimeout(() => setBanner(null), 4000);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    showBanner("New physical stock audit run created.");
    fetchCounts();
  };

  const handleDelete = async () => {
    if (!deletingCount) return;
    try {
      await cycleCountsApi.delete(deletingCount.id);
      showBanner(`Stock audit run "${deletingCount.countNumber}" deleted.`);
      fetchCounts();
    } catch (err: unknown) {
      showBanner(
        err instanceof Error ? err.message : "Failed to delete audit run.",
        "error",
      );
    } finally {
      setDeletingCount(null);
    }
  };

  const activeAuditsCount = React.useMemo(
    () =>
      counts.filter(
        (c) =>
          c.status === "COUNTING" ||
          c.status === "ASSIGNED" ||
          c.status === "DRAFT",
      ).length,
    [counts],
  );

  const reconciledAuditsCount = React.useMemo(
    () => counts.filter((c) => c.status === "APPROVED").length,
    [counts],
  );

  const filterConfigs: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Assigned", value: "ASSIGNED" },
        { label: "Counting", value: "COUNTING" },
        { label: "Approved (Reconciled)", value: "APPROVED" },
      ],
    },
  ];

  const columns: ColumnDef<CycleCountDto>[] = [
    {
      accessorKey: "countNumber",
      header: "Audit ID",
      cell: ({ row }) => (
        <Link
          href={`/cycle-counts/${row.original.id}`}
          className="font-mono text-xs font-bold text-primary hover:underline"
        >
          {row.original.countNumber}
        </Link>
      ),
    },
    {
      accessorKey: "assignedCounter",
      header: "Assigned Counter",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.assignedCounter || "Unassigned"}
        </span>
      ),
    },
    {
      id: "totalItemsCount",
      header: "Total SKUs Audited",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground">
          {row.original.lines?.length || 0} items
        </span>
      ),
    },
    {
      id: "varianceItemsCount",
      header: "Variance",
      cell: ({ row }) => {
        const count =
          row.original.lines?.filter((l) => (l.variance || 0) !== 0).length ||
          0;
        if (count === 0) {
          return (
            <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> 0 Variance
            </span>
          );
        }
        return (
          <span className="inline-flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {count} Discrepancies
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "APPROVED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              Reconciled & Approved
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 mr-1" /> {s}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Audit Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Link href={`/cycle-counts/${row.original.id}`}>
            <Button variant="ghost" size="xs" title="View details">
              <Eye className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDeletingCount(row.original)}
            title="Delete audit"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {banner && (
        <div
          className={`p-3 text-xs border rounded-md ${
            banner.type === "error"
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {banner.message}
        </div>
      )}

      <PageHeader
        title="Stock Audits & Cycle Counting"
        description="Schedule physical stock counts, log inventory variances, and execute balance reconciliations."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Stock Audit Run
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Audit Runs"
          value={counts.length}
          icon={ClipboardCheck}
        />
        <StatCard
          title="Active Stock Audits"
          value={activeAuditsCount}
          icon={Clock}
        />
        <StatCard
          title="Reconciled Audits"
          value={reconciledAuditsCount}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={counts}
        columns={columns}
        searchPlaceholder="Search stock audits by ID, counter, or status..."
        loading={loading}
        emptyTitle="No Stock Audits Found"
        emptyMessage="Click 'New Stock Audit Run' to initiate a physical inventory count."
        filterConfigs={filterConfigs}
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Initiate Physical Stock Audit"
        description="Schedule physical inventory counts, assign counter staff, and initiate stock audit runs."
        size="lg"
      >
        <CycleCountForm
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      <ConfirmDialog
        isOpen={Boolean(deletingCount)}
        onCancel={() => setDeletingCount(null)}
        title="Delete Stock Audit Run"
        description={`Are you sure you want to delete audit run "${deletingCount?.countNumber}"?`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
