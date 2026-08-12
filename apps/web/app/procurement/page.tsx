"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ShoppingCart,
  Plus,
  CheckCircle2,
  DollarSign,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import {
  purchaseOrdersApi,
  type PurchaseOrderDto,
} from "@/lib/api/purchase-orders-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function ProcurementPage() {
  const [orders, setOrders] = React.useState<PurchaseOrderDto[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    purchaseOrdersApi
      .getAll()
      .then((data) => setOrders(data || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const totalProcurementSpend = React.useMemo(() => {
    return orders.reduce((acc, po) => acc + (po?.grandTotal || 0), 0);
  }, [orders]);

  const draftCount = React.useMemo(() => {
    return orders.filter((o) => o?.status === "DRAFT").length;
  }, [orders]);

  const columns: ColumnDef<PurchaseOrderDto>[] = [
    {
      accessorKey: "poNumber",
      header: "PO Number",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-bold text-primary">
          {row.original.poNumber || "-"}
        </span>
      ),
    },
    {
      accessorKey: "supplierId",
      header: "Supplier ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground font-medium">
          {row.original.supplierId || "-"}
        </span>
      ),
    },
    {
      accessorKey: "grandTotal",
      header: "Total Amount",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.grandTotal || 0)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <CheckCircle2 className="w-3 h-3 mr-1" />{" "}
          {row.original.status || "DRAFT"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdAt ? formatDate(row.original.createdAt) : "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Procurement Control Hub"
        description="Oversee purchase requisitions, supplier purchase orders, vendor performance, and purchasing spend."
        actions={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Purchase Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Active Purchase Orders"
          value={orders.length}
          icon={ShoppingCart}
        />
        <StatCard
          title="Total Procurement Spend"
          value={formatCurrency(totalProcurementSpend)}
          icon={DollarSign}
        />
        <StatCard
          title="Draft Orders"
          value={`${draftCount} Drafts`}
          icon={FileText}
        />
      </div>

      <EntityDataTable
        data={orders}
        columns={columns}
        entityType="PurchaseOrder"
        searchPlaceholder="Search purchase orders..."
        loading={loading}
        emptyTitle="No Purchase Orders Found"
        emptyMessage="No active purchase orders match your filter."
        actionButton={
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Create Purchase Order
          </Button>
        }
      />
    </div>
  );
}
