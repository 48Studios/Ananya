"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { QrCode, RefreshCw, CheckCircle2, MapPin, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { serialsApi, type SerialDto } from "@/lib/api/serials-api";

export default function SerialsPage() {
  const [serials, setSerials] = React.useState<SerialDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchSerials = React.useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setSerials((await serialsApi.getAll()) || []);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load serial numbers",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSerials();
  }, [fetchSerials]);

  const inStockCount = React.useMemo(
    () => serials.filter((serial) => serial.locationId).length,
    [serials],
  );

  const assignedCount = React.useMemo(
    () => serials.filter((serial) => !serial.locationId).length,
    [serials],
  );

  const columns: ColumnDef<SerialDto>[] = [
    {
      accessorKey: "serialNumber",
      header: "Serial Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.serialNumber}
        </span>
      ),
    },
    {
      accessorKey: "componentSku",
      header: "Item / Product SKU",
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
      accessorKey: "locationName",
      header: "Current Storage Path",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.locationName || "Unassigned"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        if (row.original.locationId) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Indexed
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <MapPin className="w-3 h-3 mr-1" /> Unassigned
          </span>
        );
      },
    },
  ];

  if (loading) {
  return <LoadingState message="Loading serial registry..." />;
  }

  if (error) {
  return (
    <ErrorState
      title="Serial data unavailable"
      message={error}
      onRetry={fetchSerials}
    />
  );
  }

  return (
  <div className="space-y-6">
    <PageHeader
      title="Serial Number Master Index"
      description="Individual serial number tracking, barcode assignment, asset history, and component lifecycle."
      actions={
        <Button size="sm" variant="outline" onClick={fetchSerials}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      }
    />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Serials Registered"
          value={serials.length}
          icon={QrCode}
        />
        <StatCard
          title="Available In Stock"
          value={inStockCount}
          icon={CheckCircle2}
        />
        <StatCard
          title="Assigned to Orders"
          value={assignedCount}
          icon={Tag}
        />
      </div>

      <EntityDataTable
        data={serials}
        columns={columns}
        searchPlaceholder="Search serials by number, SKU, product, or location..."
        loading={false}
        emptyTitle="No Serial Numbers Registered"
        emptyMessage="No serialized inventory has been recorded yet."
      />
    </div>
  );
}
