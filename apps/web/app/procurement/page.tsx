"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ShoppingCart,
  Plus,
  DollarSign,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EntityDataTable } from "@/components/ui/entity-data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/procurement/purchase-orders/${row.original.id}`}
                    className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.poNumber || "-"}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.poNumber || "-"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "supplierId",
      header: "Supplier ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-foreground bg-muted/50 px-2 py-0.5 rounded uppercase font-bold">
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
        <StatusBadge status={row.original.status || "DRAFT"} />
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
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
      />
    </div>
  );
}
