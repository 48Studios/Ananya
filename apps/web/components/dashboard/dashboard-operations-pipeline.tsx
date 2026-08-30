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
import { formatCurrency, formatDate } from "@/lib/utils";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border border-border/80 w-fit">
          <button
            type="button"
            onClick={() => setActiveTab("production")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "production"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Factory className="w-3.5 h-3.5 text-primary" />
            <span>Production Queue</span>
            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded-full">
              {activeWorkOrders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("inbound")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "inbound"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 text-blue-500" />
            <span>Inbound Deliveries</span>
            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded-full">
              {activePurchaseOrders.length}
            </span>
          </button>
        </div>

        <Link
          href={activeTab === "production" ? "/work-orders" : "/purchase-orders"}
          className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 self-end sm:self-center"
        >
          <span>View All {activeTab === "production" ? "Work Orders" : "Orders"}</span>
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Production Tab Content */}
      {activeTab === "production" && (
        <div className="space-y-3">
          {activeWorkOrders.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-border rounded-lg bg-muted/10 space-y-2">
              <Layers className="w-6 h-6 text-muted-foreground mx-auto" />
              <p className="text-xs font-medium text-foreground">
                No active production orders on the shop floor
              </p>
              <p className="text-[11px] text-muted-foreground">
                All manufacturing runs are completed or pending BOM release.
              </p>
              <div className="pt-2">
                <Link href="/work-orders/new">
                  <Button size="xs" variant="outline" className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" />
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
                          <span className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold px-1.5 py-0.2 rounded">
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
            <div className="p-6 text-center border border-dashed border-border rounded-lg bg-muted/10 space-y-2">
              <ShoppingCart className="w-6 h-6 text-muted-foreground mx-auto" />
              <p className="text-xs font-medium text-foreground">
                No open purchase orders pending delivery
              </p>
              <p className="text-[11px] text-muted-foreground">
                All procurement orders have been fulfilled or received into storage.
              </p>
              <div className="pt-2">
                <Link href="/purchase-orders/new">
                  <Button size="xs" variant="outline" className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" />
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
                    <Button size="xs" variant="outline" className="h-7 text-xs gap-1 shrink-0">
                      <ArrowDownLeft className="w-3 h-3" />
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
