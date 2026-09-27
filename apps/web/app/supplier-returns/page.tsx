"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import {
  Undo2,
  Plus,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EntityDataTable,
  type FilterConfig,
} from "@/components/ui/entity-data-table";
import {
  supplierReturnsApi,
  type SupplierReturnDto,
} from "@/lib/api/supplier-returns-api";
import { suppliersApi } from "@/lib/api/suppliers-api";
import { purchaseOrdersApi } from "@/lib/api/purchase-orders-api";
import { formatCurrency, formatDate } from "@/lib/utils";

import { DialogShell } from "@/components/ui/dialog-shell";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SupplierReturnForm } from "@/components/supplier-returns/supplier-return-form";

export default function SupplierReturnsPage() {
  const [returns, setReturns] = React.useState<SupplierReturnDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [suppliersMap, setSuppliersMap] = React.useState<Record<string, string>>({});
  const [posMap, setPosMap] = React.useState<Record<string, string>>({});

  const fetchReturns = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      supplierReturnsApi.getAll().catch(() => []),
      suppliersApi.getAll().catch(() => []),
      purchaseOrdersApi.getAll().catch(() => []),
    ])
      .then(([data, sups, pos]) => {
        setReturns(data || []);
        const sMap: Record<string, string> = {};
        for (const s of sups) sMap[s.id] = s.name;
        setSuppliersMap(sMap);
        const pMap: Record<string, string> = {};
        for (const p of pos) pMap[p.id] = p.poNumber;
        setPosMap(pMap);
      })
      .catch(() => setReturns([]))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const handleSuccess = () => {
    setIsFormOpen(false);
    fetchReturns();
  };

  const totalValue = React.useMemo(() => {
    return returns.reduce((acc, r) => acc + (r?.totalAmount || 0), 0);
  }, [returns]);

  const filterConfigs: FilterConfig[] = [
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Draft", value: "DRAFT" },
        { label: "Approved", value: "APPROVED" },
        { label: "Dispatched", value: "DISPATCHED" },
        { label: "Completed", value: "COMPLETED" },
        { label: "Cancelled", value: "CANCELLED" },
      ],
    },
  ];

  const columns: ColumnDef<SupplierReturnDto>[] = [
    {
      accessorKey: "returnNumber",
      header: "Return No.",
      meta: { width: "13%" },
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[130px]">
          <TooltipProvider delay={100}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/supplier-returns/${row.original.id}`}
                    title={row.original.returnNumber || "-"}
                    className="font-mono text-xs text-foreground bg-muted/50 px-2 py-1 rounded hover:bg-muted transition-colors uppercase font-bold inline-block truncate max-w-full align-middle"
                  />
                }
              >
                {row.original.returnNumber || "-"}
              </TooltipTrigger>
              <TooltipContent side="top" className="font-mono text-xs">
                {row.original.returnNumber || "-"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
    },
    {
      accessorKey: "supplierName",
      header: "Supplier",
      cell: ({ row }) => {
        const name =
          row.original.supplierName ||
          suppliersMap[row.original.supplierId] ||
          "Supplier";
        return <span className="font-medium text-foreground">{name}</span>;
      },
    },
    {
      accessorKey: "poNumber",
      header: "Ref PO",
      cell: ({ row }) => {
        const poNum =
          row.original.poNumber ||
          (row.original.purchaseOrderId
            ? posMap[row.original.purchaseOrderId]
            : undefined);
        if (!poNum) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <div className="min-w-0 max-w-[130px]">
            <TooltipProvider delay={100}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href={
                        row.original.purchaseOrderId
                          ? `/purchase-orders/${row.original.purchaseOrderId}`
                          : `/purchase-orders`
                      }
                      title={poNum}
                      className="font-mono text-xs text-muted-foreground hover:text-foreground bg-muted/30 px-1.5 py-0.5 rounded transition-colors uppercase inline-block truncate max-w-full align-middle"
                    />
                  }
                >
                  {poNum}
                </TooltipTrigger>
                <TooltipContent side="top" className="font-mono text-xs">
                  {poNum}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      },
    },
    {
      accessorKey: "totalAmount",
      header: "Return Value",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {formatCurrency(row.original.totalAmount || 0)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const s = row.original.status;
        if (s === "COMPLETED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> COMPLETED
            </span>
          );
        }
        if (s === "APPROVED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <CheckCircle2 className="w-3 h-3 mr-1" /> APPROVED
            </span>
          );
        }
        if (s === "DISPATCHED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Truck className="w-3 h-3 mr-1" /> DISPATCHED
            </span>
          );
        }
        if (s === "CANCELLED") {
          return (
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-muted text-muted-foreground border border-border">
              <XCircle className="w-3 h-3 mr-1" /> CANCELLED
            </span>
          );
        }
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 mr-1" /> DRAFT
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.createdAt ? formatDate(row.original.createdAt) : "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="text-right block w-full">Actions</span>,
      meta: {
        width: "8%",
        headerClassName: "text-right",
        cellClassName: "text-right",
      },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Link href={`/supplier-returns/${row.original.id}`}>
            <Button
              variant="ghost"
              size="icon-xs"
              title="View details & status"
              aria-label="View details & status"
            >
              <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Returns & Debit Memos"
        description="Process non-conforming vendor material returns, debit memo issuances, and credit receipts."
        actions={
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create Supplier Return
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Returns Filed"
          value={returns.length}
          icon={Undo2}
        />
        <StatCard
          title="Return Valuation"
          value={formatCurrency(totalValue)}
          icon={CheckCircle2}
        />
        <StatCard
          title="Credited Returns"
          value={returns.filter((r) => r?.status === "COMPLETED").length}
          icon={CheckCircle2}
        />
      </div>

      <EntityDataTable
        data={returns}
        columns={columns}
        searchPlaceholder="Search supplier returns by return number or supplier..."
        loading={loading}
        filterConfigs={filterConfigs}
        emptyTitle="No Supplier Returns Found"
        emptyMessage="No supplier material returns recorded."
      />

      <DialogShell
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="Create Supplier Return"
        description="Process vendor material return and issue debit memo."
        size="sm"
      >
        <SupplierReturnForm
          onSuccess={handleSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </DialogShell>
    </div>
  );
}
