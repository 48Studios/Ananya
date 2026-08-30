"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Wrench,
  RotateCcw,
  Bell,
  ArrowRight,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PurchaseOrderDto } from "@/lib/api/purchase-orders-api";
import { WorkOrderDto } from "@/lib/api/work-orders-api";
import { StockAdjustmentDto } from "@/lib/api/stock-adjustments-api";
import { NotificationDto } from "@/lib/api/notifications-api";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface AttentionItem {
  id: string;
  type: "PURCHASE_ORDER" | "WORK_ORDER" | "STOCK_ADJUSTMENT" | "ALERT";
  title: string;
  subtitle: string;
  status: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  href: string;
  actionLabel: string;
  actionHref: string;
  timestamp?: string;
}

interface DashboardAttentionQueueProps {
  purchaseOrders?: PurchaseOrderDto[];
  workOrders?: WorkOrderDto[];
  adjustments?: StockAdjustmentDto[];
  notifications?: NotificationDto[];
  loading?: boolean;
}

export function DashboardAttentionQueue({
  purchaseOrders = [],
  workOrders = [],
  adjustments = [],
  notifications = [],
  loading = false,
}: DashboardAttentionQueueProps) {
  const items = React.useMemo<AttentionItem[]>(() => {
    const list: AttentionItem[] = [];

    // 1. Open / Issued Purchase Orders needing delivery or receipt
    purchaseOrders
      .filter((po) => po.status === "ISSUED" || po.status === "PARTIALLY_RECEIVED")
      .slice(0, 3)
      .forEach((po) => {
        list.push({
          id: `po-${po.id}`,
          type: "PURCHASE_ORDER",
          title: `Purchase Order ${po.poNumber}`,
          subtitle: `${po.lines.length} items • ${formatCurrency(po.grandTotal, po.currency)}${
            po.expectedDeliveryDate
              ? ` • Due ${formatDate(po.expectedDeliveryDate)}`
              : ""
          }`,
          status: po.status,
          href: `/purchase-orders/${po.id}`,
          actionLabel: "Receive Stock",
          actionHref: `/goods-receipts/new?poId=${po.id}`,
          timestamp: po.updatedAt,
        });
      });

    // 2. Active / Urgent Work Orders in progress
    workOrders
      .filter((wo) => wo.status === "IN_PROGRESS" || wo.priority === "URGENT" || wo.priority === "HIGH")
      .slice(0, 3)
      .forEach((wo) => {
        list.push({
          id: `wo-${wo.id}`,
          type: "WORK_ORDER",
          title: `Work Order ${wo.productionNumber}`,
          subtitle: `Progress: ${wo.quantityCompleted}/${wo.quantityPlanned} units completed (${wo.priority} Priority)`,
          status: wo.status,
          priority: wo.priority,
          href: `/work-orders/${wo.id}`,
          actionLabel: "View Order",
          actionHref: `/work-orders/${wo.id}`,
          timestamp: wo.updatedAt,
        });
      });

    // 3. Pending Stock Adjustments requiring review
    adjustments
      .filter((adj) => adj.status === "PENDING")
      .slice(0, 2)
      .forEach((adj) => {
        list.push({
          id: `adj-${adj.id}`,
          type: "STOCK_ADJUSTMENT",
          title: `Stock Adjustment ${adj.adjustmentNumber}`,
          subtitle: `Reason: ${adj.reason || "Discrepancy reconciliation"} • ${adj.lines.length} lines`,
          status: adj.status,
          href: `/stock-adjustments/${adj.id}`,
          actionLabel: "Review",
          actionHref: `/stock-adjustments/${adj.id}`,
          timestamp: adj.updatedAt,
        });
      });

    // 4. High-priority Unread Notifications
    notifications
      .filter((n) => !n.isRead && (n.priority === "HIGH" || n.priority === "URGENT"))
      .slice(0, 2)
      .forEach((n) => {
        list.push({
          id: `notif-${n.id}`,
          type: "ALERT",
          title: n.title,
          subtitle: n.message,
          status: "PENDING",
          href: "/notifications",
          actionLabel: "View Alert",
          actionHref: "/notifications",
          timestamp: n.createdAt,
        });
      });

    return list;
  }, [purchaseOrders, workOrders, adjustments, notifications]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-44 bg-muted animate-pulse rounded" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-muted/40 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const renderIcon = (type: AttentionItem["type"]) => {
    switch (type) {
      case "PURCHASE_ORDER":
        return <ShoppingCart className="w-4 h-4 text-primary" />;
      case "WORK_ORDER":
        return <Wrench className="w-4 h-4 text-amber-500" />;
      case "STOCK_ADJUSTMENT":
        return <RotateCcw className="w-4 h-4 text-blue-500" />;
      case "ALERT":
        return <Bell className="w-4 h-4 text-rose-500" />;
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <h3 className="text-sm font-semibold text-foreground">
            Operational Attention Queue
          </h3>
          {items.length > 0 && (
            <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full">
              {items.length} Pending
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          Actionable orders, receipts, and approvals requiring review
        </p>
      </div>

      {/* Items or Empty State */}
      {items.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              All operational queues are clear
            </p>
            <p className="text-[11px] text-muted-foreground">
              No pending purchase receipts, overdue work orders, or unapproved stock adjustments require immediate attention.
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 bg-background border border-border rounded-lg shrink-0 mt-0.5">
                  {renderIcon(item.type)}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={item.href}
                      className="text-xs font-semibold text-foreground hover:text-primary transition-colors inline-flex items-center gap-1 truncate"
                    >
                      {item.title}
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </Link>
                    <StatusBadge status={item.status} className="text-[10px] py-0 px-1.5" />
                    {item.priority === "URGENT" && (
                      <span className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold px-1.5 py-0.2 rounded">
                        URGENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {item.timestamp && (
                  <span className="text-[10px] font-mono text-muted-foreground hidden md:inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(item.timestamp).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
                <Link href={item.actionHref}>
                  <Button size="xs" variant="outline" className="h-7 text-xs gap-1">
                    {item.actionLabel}
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
