"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Boxes,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { batchesApi, type BatchDto } from "@/lib/api/batches-api";
import { formatDate } from "@/lib/utils";

export default function BatchesPage() {
  const [batches, setBatches] = React.useState<BatchDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchBatches = React.useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setBatches((await batchesApi.getAll()) || []);
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
    () =>
      batches.filter((batch) => {
        if (!batch.expiryDate) return true;
        return new Date(batch.expiryDate) >= new Date();
      }).length,
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

  const columns: ColumnDef<BatchDto>[] = [
    {
      accessorKey: "batchNumber",
      header: "Batch / Lot No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {row.original.batchNumber}
        </span>
      ),
    },
    {
      accessorKey: "componentSku",
      header: "SKU / Material",
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">
            {row.original.componentSku}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.componentName}
          </p>
        </div>
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
        <span className="text-xs text-muted-foreground">
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
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.expiryDate)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const isExpired =
          row.original.expiryDate !== null &&
          row.original.expiryDate !== undefined &&
          new Date(row.original.expiryDate) < new Date();
        if (!isExpired) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Traceable
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive border border-destructive/20">
            <AlertCircle className="w-3 h-3 mr-1" /> Expired
          </span>
        );
      },
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
          icon={Boxes}
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
