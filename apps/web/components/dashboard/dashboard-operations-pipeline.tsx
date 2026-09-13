"use client";

import * as React from "react";
import Link from "next/link";
import {
  Factory,
  ShoppingCart,
  ArrowRight,
  ExternalLink,
  ArrowDownLeft,
  Plus,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkOrderDto } from "@/lib/api/work-orders-api";
import { PurchaseOrderDto } from "@/lib/api/purchase-orders-api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

interface DashboardOperationsPipelineProps {
  workOrders?: WorkOrderDto[];
  purchaseOrders?: PurchaseOrderDto[];
  loading?: boolean;
}

export function DashboardOperationsPipeline({
  workOrders = [],
  purchaseOrders = [],
  loading = false,
}: DashboardOperationsPipelineProps) {
  const [activeTab, setActiveTab] = React.useState<"production" | "inbound">("production");

  const activeWorkOrders = React.useMemo(() => {
    return workOrders
      .filter((wo) => wo.status !== "COMPLETED" && wo.status !== "CLOSED" && wo.status !== "CANCELLED")
      .slice(0, 5);
  }, [workOrders]);

  const activePurchaseOrders = React.useMemo(() => {
    return purchaseOrders
      .filter((po) => po.status === "ISSUED" || po.status === "PARTIALLY_RECEIVED" || po.status === "DRAFT")
      .slice(0, 5);
  }, [purchaseOrders]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-44 bg-muted animate-pulse rounded" />
          <div className="h-6 w-32 bg-muted animate-pulse rounded-lg" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/40 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
      {/* Header with Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-y-2.5 gap-x-3">
        {/* Tab Selector (fixed/stable width, equal-width tabs) */}
        <div className="grid grid-cols-2 p-1 gap-1 bg-muted/60 rounded-lg border border-border/80 w-full sm:w-[330px] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("production")}
            className={cn(
              "h-8 px-2.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap border select-none outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
              activeTab === "production"
                ? "bg-background text-foreground shadow-2xs border-border/60 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40 border-transparent",
            )}
          >
            <Factory
              className={cn(
                "size-3.5 shrink-0 transition-colors",
                activeTab === "production" ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="truncate">Production Queue</span>
            <span
              className={cn(
                "font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none shrink-0 transition-colors",
                activeTab === "production"
                  ? "bg-muted text-foreground font-semibold"
                  : "bg-muted/80 text-muted-foreground",
              )}
            >
              {activeWorkOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("inbound")}
            className={cn(
              "h-8 px-2.5 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 whitespace-nowrap border select-none outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
              activeTab === "inbound"
                ? "bg-background text-foreground shadow-2xs border-border/60 font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40 border-transparent",
            )}
          >
            <ShoppingCart
              className={cn(
                "size-3.5 shrink-0 transition-colors",
                activeTab === "inbound" ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="truncate">Inbound Deliveries</span>
            <span
              className={cn(
                "font-mono text-[10px] px-1.5 py-0.5 rounded-full leading-none shrink-0 transition-colors",
                activeTab === "inbound"
                  ? "bg-muted text-foreground font-semibold"
                  : "bg-muted/80 text-muted-foreground",
              )}
            >
              {activePurchaseOrders.length}
            </span>
          </button>
        </div>

        {/* Action Link (flexibly positioned with stable slot width) */}
        <div className="flex items-center justify-end shrink-0 min-w-[145px]">
          <Link
            href={activeTab === "production" ? "/work-orders" : "/purchase-orders"}
            className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 whitespace-nowrap self-center"
          >
            <span>View All {activeTab === "production" ? "Work Orders" : "Orders"}</span>
            <ArrowRight className="size-3.5 shrink-0" />
          </Link>
        </div>
      </div>

      {/* Production Tab Content */}
      {activeTab === "production" && (
        <div className="space-y-3">
          {activeWorkOrders.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-lg bg-muted/10 space-y-2.5">
              <Layers className="size-6 text-muted-foreground mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  No active production orders on the shop floor
                </p>
                <p className="text-[11px] text-muted-foreground">
                  All manufacturing runs are completed or pending BOM release.
                </p>
              </div>
              <div className="pt-1">
                <Link href="/work-orders/new">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                    <Plus className="size-3.5" />
                    New Work Order
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
              {activeWorkOrders.map((wo) => {
                const percent = Math.min(
                  100,
                  Math.round(
                    ((wo.quantityCompleted || 0) / Math.max(1, wo.quantityPlanned || 1)) * 100,
                  ),
                );

                return (
                  <div
                    key={wo.id}
                    className="p-3 space-y-2 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <Link
                          href={`/work-orders/${wo.id}`}
                          className="text-xs font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1 truncate"
                        >
                          {wo.productionNumber}
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </Link>
                        <StatusBadge status={wo.status} className="text-[10px] py-0 px-1.5" />
                        {wo.priority === "URGENT" && (
                          <span className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            URGENT
                          </span>
                        )}
                      </div>

                      <span className="font-mono text-xs font-bold text-foreground">
                        {percent}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {wo.quantityCompleted} of {wo.quantityPlanned} units output
                        </span>
                        {wo.quantityScrapped > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px]">
                            {wo.quantityScrapped} scrapped
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inbound Tab Content */}
      {activeTab === "inbound" && (
        <div className="space-y-3">
          {activePurchaseOrders.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-lg bg-muted/10 space-y-2.5">
              <ShoppingCart className="size-6 text-muted-foreground mx-auto" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  No open purchase orders pending delivery
                </p>
                <p className="text-[11px] text-muted-foreground">
                  All procurement orders have been fulfilled or received into storage.
                </p>
              </div>
              <div className="pt-1">
                <Link href="/purchase-orders/new">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                    <Plus className="size-3.5" />
                    Create Purchase Order
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
              {activePurchaseOrders.map((po) => (
                <div
                  key={po.id}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="text-xs font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1 truncate"
                      >
                        {po.poNumber}
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </Link>
                      <StatusBadge status={po.status} className="text-[10px] py-0 px-1.5" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {po.lines.length} lines • {formatCurrency(po.grandTotal, po.currency)}
                      {po.expectedDeliveryDate && ` • Due ${formatDate(po.expectedDeliveryDate)}`}
                    </p>
                  </div>

                  <Link href={`/goods-receipts/new?poId=${po.id}`}>
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0">
                      <ArrowDownLeft className="size-3.5" />
                      Receive
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
