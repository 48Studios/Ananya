"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Package, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { finishedGoodsApi } from "@/lib/api/finished-goods-api";
import { workOrdersApi } from "@/lib/api/work-orders-api";
import { componentsApi } from "@/lib/api/components-api";
import {
  buildFinishedGoodsRows,
  toProductionNumberMap,
  type FinishedGoodsRow,
} from "@/lib/finished-goods";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import { FinishedGoodsForm } from "@/components/finished-goods/finished-goods-form";

export default function FinishedGoodsPage() {
  const [goods, setGoods] = React.useState<FinishedGoodsRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  const fetchGoods = React.useCallback(() => {
    setLoading(true);
    // A receipt carries ids; the work-order number and component labels are
    // resolved from their own APIs.
    Promise.all([
      finishedGoodsApi.getAll(),
      workOrdersApi.getAll().catch(() => []),
      componentsApi.getAll().catch(() => []),
    ])
      .then(([rows, orders, components]) =>
        setGoods(
          buildFinishedGoodsRows(rows, {
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
      .catch(() => setGoods([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchGoods();
  }, [fetchGoods]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchGoods();
  };

  const totalProduced = React.useMemo(
    () => goods.reduce((total, row) => total + row.totalProduced, 0),
    [goods],
  );

  const columns: ColumnDef<FinishedGoodsRow>[] = [
    {
      accessorKey: "fgrNumber",
      header: "Receipt No.",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded uppercase font-bold inline-block truncate max-w-full align-middle">
          {row.original.fgrNumber}
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
      header: "Received Products",
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
      accessorKey: "totalProduced",
      header: "Quantity Produced",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-foreground">
          {row.original.totalProduced}
        </span>
      ),
    },
    {
      accessorKey: "totalScrapped",
      header: "Scrapped",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.totalScrapped}
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
          {row.original.postedAt
            ? formatDate(row.original.postedAt)
            : "Not posted"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finished Goods Inventory Master"
        description="Monitor completed manufactured products, available finished stock, and valuation."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Receive Production Batch
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Receipts Recorded"
          value={goods.length}
          icon={Package}
        />
        <StatCard
          title="Units Produced"
          value={totalProduced}
          icon={CheckCircle2}
        />
        <StatCard
          title="Posted Receipts"
          value={goods.filter((row) => row.status === "POSTED").length}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={goods}
        columns={columns}
        searchPlaceholder="Search finished goods by SKU, name, or location..."
        loading={loading}
        emptyTitle="No Finished Goods Found"
        emptyMessage="No completed finished goods match your search."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Receive Production Batch"
        description="Receive completed manufacturing output batch into finished goods inventory."
        size="sm"
      >
        <FinishedGoodsForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
