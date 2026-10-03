"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Package,
  RefreshCw,
  CheckCircle2,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { batchesApi } from "@/lib/api/batches-api";
import { componentsApi } from "@/lib/api/components-api";
import {
  buildBatchRows,
  toComponentLabelMap,
  type BatchRow,
} from "@/lib/batches";
import { formatDate } from "@/lib/utils";

export default function BatchesPage() {
  const [batches, setBatches] = React.useState<BatchRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchBatches = React.useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      // A batch carries `componentId`; the component label is resolved from the
      // components API so a caller without that read access still sees batches.
      const [rows, components] = await Promise.all([
        batchesApi.getAll(),
        componentsApi.getAll().catch(() => []),
      ]);
      setBatches(buildBatchRows(rows, toComponentLabelMap(components)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const activeBatchesCount = React.useMemo(
    () => batches.filter((batch) => !batch.expired).length,
    [batches],
  );

  const expiringCount = React.useMemo(() => {
    const threshold = Date.now() + 30 * 24 * 60 * 60 * 1000;
    return batches.filter((batch) => {
      if (!batch.expiryDate) return false;
      const expiry = new Date(batch.expiryDate).getTime();
      return expiry >= Date.now() && expiry <= threshold;
    }).length;
  }, [batches]);

  const columns: ColumnDef<BatchRow>[] = [
    {
      accessorKey: "batchNumber",
      header: "Batch / Lot No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase font-bold inline-block truncate max-w-full align-middle">
          {row.original.batchNumber}
        </span>
      ),
    },
    {
      accessorKey: "componentLabel",
      header: "SKU / Material",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.componentLabel || "Unknown component"}
        </span>
      ),
    },
    {
      accessorKey: "supplierBatchNumber",
      header: "Supplier Lot Ref",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.supplierBatchNumber || "Not recorded"}
        </span>
      ),
    },
    {
      accessorKey: "manufacturingDate",
      header: "Mfg Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.manufacturingDate
            ? formatDate(row.original.manufacturingDate)
            : "Not recorded"}
        </span>
      ),
    },
    {
      accessorKey: "expiryDate",
      header: "Expiry Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {formatDate(row.original.expiryDate)}
        </span>
      ),
    },
    {
      accessorKey: "expired",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.expired ? "OVERDUE" : "ACTIVE"}
          label={row.original.expired ? "Expired" : "Traceable"}
        />
      ),
    },
  ];

  if (loading) {
    return <LoadingState message="Loading batch registry..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Batch data unavailable"
        message={error}
        onRetry={fetchBatches}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batch & Lot Management"
        description="Track material batches, lot expiry dates, quarantine holds, and batch genealogy."
        actions={
          <Button size="sm" variant="outline" onClick={fetchBatches}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Registered Batches"
          value={batches.length}
          icon={Package}
        />
        <StatCard
          title="Non-Expired Batches"
          value={activeBatchesCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Expiring Soon (<30 Days)"
          value={`${expiringCount} Batches`}
          icon={CalendarClock}
        />
      </div>

      <EntityDataTable
        data={batches}
        columns={columns}
        searchPlaceholder="Search batches by number, SKU, or material..."
        loading={false}
        emptyTitle="No Lot Batches Found"
        emptyMessage="No batch records have been created yet."
      />
    </div>
  );
}
