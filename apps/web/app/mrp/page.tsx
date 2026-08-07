"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Cpu, CheckCircle2, Play, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { mrpApi, type MrpRequirementDto } from "@/lib/api/mrp-api";

export default function MrpPage() {
  const [items, setItems] = React.useState<MrpRequirementDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [banner, setBanner] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchRequirements = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await mrpApi.getGrossRequirements();
      setItems(data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRequirements();
  }, [fetchRequirements]);

  const handleRunEngine = async () => {
    setRunning(true);
    try {
      const result = await mrpApi.executeRun();
      setBanner({
        message: `MRP Calculation Engine finished run "${result.runNumber}".`,
        type: "success",
      });
      fetchRequirements();
    } catch (err: unknown) {
      setBanner({
        message: err instanceof Error ? err.message : "Failed to execute MRP run",
        type: "error",
      });
    } finally {
      setRunning(false);
      setTimeout(() => setBanner(null), 5000);
    }
  };

  const shortagesCount = React.useMemo(() => {
    return items.filter((i) => (i?.shortageQuantity || 0) > 0).length;
  }, [items]);

  const columns: ColumnDef<MrpRequirementDto>[] = [
    {
      accessorKey: "sku",
      header: "Component SKU",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.sku || "-"}
        </span>
      ),
    },
    {
      accessorKey: "componentName",
      header: "Description",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">
          {row.original.componentName || "-"}
        </span>
      ),
    },
    {
      accessorKey: "grossDemand",
      header: "Gross Demand",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-semibold">
          {row.original.grossDemand || 0} units
        </span>
      ),
    },
    {
      accessorKey: "availableStock",
      header: "OnHand Stock",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.availableStock || 0} units
        </span>
      ),
    },
    {
      accessorKey: "shortageQuantity",
      header: "Net Shortage",
      cell: ({ row }) => {
        const qty = row.original.shortageQuantity || 0;
        if (qty === 0) {
          return (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              0 (Fully Stocked)
            </span>
          );
        }
        return (
          <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
            -{qty} Shortfall
          </span>
        );
      },
    },
    {
      accessorKey: "recommendedAction",
      header: "MRP Recommendation",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
          {row.original.recommendedAction || "NONE"}
        </span>
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
        title="Material Requirements Planning (MRP) Hub"
        description="Calculate gross material demand, net stock shortages, capacity bottlenecks, and automated procurement suggestions."
        actions={
          <Button size="sm" onClick={handleRunEngine} disabled={running}>
            {running ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-1.5" />
            )}
            Run MRP Calculation Engine
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Components Evaluated"
          value={items.length}
          icon={Cpu}
        />
        <StatCard
          title="Active Shortages"
          value={shortagesCount}
          icon={AlertTriangle}
        />
        <StatCard
          title="Engine Status"
          value={running ? "Executing..." : "Synchronized"}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={items}
        columns={columns}
        searchPlaceholder="Search gross requirements by SKU or component..."
        loading={loading}
        emptyTitle="No Requirements Found"
        emptyMessage="No gross component requirements currently active."
      />
    </div>
  );
}
