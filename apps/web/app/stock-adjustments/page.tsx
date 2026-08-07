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
  MapPin,
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
import { StockAdjustmentForm } from "@/components/stock-adjustments/adjustment-form";
import {
  stockAdjustmentsApi,
  type StockAdjustmentDto,
  type StockAdjustmentStatus,
} from "@/lib/api/stock-adjustments-api";
import { locationsApi, type LocationDto } from "@/lib/api/locations-api";

function getStatusBadge(status: StockAdjustmentStatus) {
  switch (status) {
    case "APPROVED":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Approved
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 mr-1" />
          Pending Approval
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

export default function StockAdjustmentsPage() {
  const [adjustments, setAdjustments] = React.useState<StockAdjustmentDto[]>(
    [],
  );
  const [locationsMap, setLocationsMap] = React.useState<
    Record<string, LocationDto>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const fetchAdjustments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adjs, locs] = await Promise.all([
        stockAdjustmentsApi.getAll(),
        locationsApi.getAll().catch(() => []),
      ]);
      setAdjustments(adjs);

      const locMap: Record<string, LocationDto> = {};
      for (const l of locs) locMap[l.id] = l;
      setLocationsMap(locMap);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch Stock Adjustments");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  const pendingCount = React.useMemo(
    () => adjustments.filter((a) => a.status === "PENDING").length,
    [adjustments],
  );
  const approvedCount = React.useMemo(
    () => adjustments.filter((a) => a.status === "APPROVED").length,
    [adjustments],
  );

  const columns = React.useMemo<ColumnDef<StockAdjustmentDto>[]>(
    () => [
      {
        accessorKey: "adjustmentNumber",
        header: "Adjustment #",
        cell: ({ row }) => (
          <Link
            href={`/stock-adjustments/${row.original.id}`}
            className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold"
          >
            {row.original.adjustmentNumber}
          </Link>
        ),
      },
      {
        accessorKey: "locationId",
        header: "Target Location",
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
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <span className="text-xs text-foreground">{row.original.reason}</span>
        ),
      },
      {
        accessorKey: "lines",
        header: "Reconciled Items",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-foreground">
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
        accessorKey: "createdBy",
        header: "Created By",
        cell: ({ row }) => (
          <span className="text-xs text-foreground">
            {row.original.createdBy}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Date",
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
            <Link href={`/stock-adjustments/${row.original.id}`}>
              <Button
                variant="ghost"
                size="icon-xs"
                title="View details & approval"
              >
                <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </Button>
            </Link>
          </div>
        ),
      },
    ],
    [locationsMap],
  );

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Pending", value: "PENDING" },
        { label: "Approved", value: "APPROVED" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
    },
  ];

  const handleFormSuccess = (savedAdj: StockAdjustmentDto) => {
    setAdjustments((prev) => [savedAdj, ...prev]);
    setToastMessage(
      `Stock Adjustment "${savedAdj.adjustmentNumber}" submitted for approval.`,
    );
    setIsFormOpen(false);
    setTimeout(() => setToastMessage(null), 4000);
    fetchAdjustments();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Stock Adjustments"
        description="Reconcile physical inventory count discrepancies with complete audit trail, difference calculations, and approval workflows."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Stock Adjustment
          </Button>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Adjustments"
          value={adjustments.length}
          subtitle="Reconciliation documents"
          icon={Wrench}
        />
        <StatCard
          title="Pending Approval"
          value={pendingCount}
          subtitle="Awaiting authorization"
          icon={Clock}
        />
        <StatCard
          title="Approved & Posted"
          value={approvedCount}
          subtitle="Ledger updated"
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
          <Button variant="ghost" size="xs" onClick={fetchAdjustments}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Retry
          </Button>
        </div>
      )}

      {/* Creation Modal Form */}
      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Create Stock Adjustment"
        description="Record a stock variance with its location, justification, and reconciled component line items before approval."
        size="md"
      >
        <StockAdjustmentForm
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>

      {/* Data Table */}
      <EntityDataTable
        columns={columns}
        data={adjustments}
        searchKey="adjustmentNumber"
        searchPlaceholder="Search by adjustment # or reason..."
        filters={filterConfigs}
        loading={loading}
        emptyTitle="No stock adjustments found"
        emptyMessage="Get started by creating your first inventory reconciliation document."
      />
    </div>
  );
}
