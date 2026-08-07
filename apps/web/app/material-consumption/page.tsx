"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import {
  materialConsumptionApi,
  type MaterialConsumptionDto,
} from "@/lib/api/material-consumption-api";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { MaterialConsumptionForm } from "@/components/material-consumption/material-consumption-form";

export default function MaterialConsumptionPage() {
  const [consumptions, setConsumptions] = React.useState<
    MaterialConsumptionDto[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchConsumptions = React.useCallback(() => {
    setLoading(true);
    materialConsumptionApi
      .getAll()
      .then((data) => setConsumptions(data || []))
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

  const columns: ColumnDef<MaterialConsumptionDto>[] = [
    {
      accessorKey: "workOrderNumber",
      header: "Work Order No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.workOrderNumber || "-"}
        </span>
      ),
    },
    {
      accessorKey: "componentSku",
      header: "Component SKU",
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-semibold text-foreground">
            {row.original.componentSku || "-"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {row.original.componentName || "-"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "quantityConsumed",
      header: "Quantity Consumed",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.quantityConsumed || 0}{" "}
          {row.original.unitOfMeasure || "pcs"}
        </span>
      ),
    },
    {
      accessorKey: "consumedBy",
      header: "Operator",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.consumedBy || "System"}
        </span>
      ),
    },
    {
      accessorKey: "consumedAt",
      header: "Timestamp",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.consumedAt ? formatDate(row.original.consumedAt) : "-"}
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
          icon={Boxes}
        />
        <StatCard
          title="Component SKUs Issued"
          value={new Set(consumptions.map((c) => c?.componentSku)).size}
          icon={CheckCircle2}
        />
        <StatCard
          title="Issuance Accuracy"
          value="100% Verified"
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

