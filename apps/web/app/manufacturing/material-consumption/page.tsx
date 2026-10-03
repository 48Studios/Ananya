"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { materialConsumptionApi } from "@/lib/api/material-consumption-api";
import { workOrdersApi } from "@/lib/api/work-orders-api";
import { componentsApi } from "@/lib/api/components-api";
import {
  buildConsumptionRows,
  toProductionNumberMap,
  type MaterialConsumptionRow,
} from "@/lib/material-consumption";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { MaterialConsumptionForm } from "@/components/material-consumption/material-consumption-form";

export default function MaterialConsumptionPage() {
  const [consumptions, setConsumptions] = React.useState<
    MaterialConsumptionRow[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchConsumptions = React.useCallback(() => {
    setLoading(true);
    // The header carries ids; work-order numbers and component labels are
    // resolved from their own APIs.
    Promise.all([
      materialConsumptionApi.getAll(),
      workOrdersApi.getAll().catch(() => []),
      componentsApi.getAll().catch(() => []),
    ])
      .then(([rows, orders, components]) =>
        setConsumptions(
          buildConsumptionRows(rows, {
            productionNumbers: toProductionNumberMap(orders),
            componentNames: new Map(
              components.map((component) => [
                component.id,
                `${component.sku} — ${component.name}`,
              ]),
            ),
          }),
        ),
      )
      .catch(() => setConsumptions([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchConsumptions();
  }, [fetchConsumptions]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchConsumptions();
  };

  const columns: ColumnDef<MaterialConsumptionRow>[] = [
    {
      accessorKey: "consumptionNumber",
      header: "Consumption No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase font-bold inline-block truncate max-w-full align-middle">
          {row.original.consumptionNumber}
        </span>
      ),
    },
    {
      accessorKey: "productionOrderLabel",
      header: "Work Order",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.productionOrderLabel || "Unresolved work order"}
        </span>
      ),
    },
    {
      accessorKey: "componentLabels",
      header: "Materials Issued",
      cell: ({ row }) => (
        <div>
          <p className="text-xs text-muted-foreground">
            {row.original.lineCount === 0
              ? "No lines recorded"
              : `${row.original.lineCount} line${row.original.lineCount === 1 ? "" : "s"}`}
          </p>
          <p className="text-[11px] text-muted-foreground truncate max-w-[220px]">
            {row.original.componentLabels.join(", ") || "—"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "totalConsumed",
      header: "Quantity Consumed",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.totalConsumed}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status || "DRAFT"} />
      ),
    },
    {
      accessorKey: "postedAt",
      header: "Posted",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.postedAt ? formatDate(row.original.postedAt) : "Not posted"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Consumption & Issue Log"
        description="Track component issues, raw material consumption, and job cost allocations for work orders."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Issue Material to Work Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Issues Logged"
          value={consumptions.length}
          icon={Package}
        />
        <StatCard
          title="Components Issued"
          value={
            new Set(consumptions.flatMap((c) => c.componentLabels)).size
          }
          icon={CheckCircle2}
        />
        <StatCard
          title="Posted Documents"
          value={consumptions.filter((c) => c.status === "POSTED").length}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={consumptions}
        columns={columns}
        searchPlaceholder="Search material issues by work order, component, or operator..."
        loading={loading}
        emptyTitle="No Material Consumptions Found"
        emptyMessage="No material consumption records match your filter."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Issue Material to Work Order"
        description="Allocate and log raw material consumption against shop-floor work orders."
        size="sm"
      >
        <MaterialConsumptionForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
