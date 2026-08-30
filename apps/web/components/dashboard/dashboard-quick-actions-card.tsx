"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus,
  ShoppingCart,
  ArrowDownLeft,
  ArrowRightLeft,
  Factory,
  QrCode,
  Zap,
} from "lucide-react";

export function DashboardQuickActionsCard() {
  const actions = [
    {
      id: "act-new-comp",
      title: "New Component",
      description: "Register a new catalog item or SKU",
      href: "/components/new",
      icon: Plus,
      variant: "default" as const,
    },
    {
      id: "act-create-po",
      title: "Create Purchase Order",
      description: "Order materials from approved suppliers",
      href: "/purchase-orders/new",
      icon: ShoppingCart,
      variant: "outline" as const,
    },
    {
      id: "act-receive-stock",
      title: "Receive Goods",
      description: "Inspect & record inbound deliveries",
      href: "/goods-receipts/new",
      icon: ArrowDownLeft,
      variant: "outline" as const,
    },
    {
      id: "act-stock-movement",
      title: "Record Stock Movement",
      description: "Issue, adjust, or transfer stock",
      href: "/transactions/new",
      icon: ArrowRightLeft,
      variant: "outline" as const,
    },
    {
      id: "act-new-wo",
      title: "New Work Order",
      description: "Schedule production from active BOM",
      href: "/work-orders/new",
      icon: Factory,
      variant: "outline" as const,
    },
    {
      id: "act-barcode-studio",
      title: "Barcode Studio",
      description: "Scan hardware & batch print labels",
      href: "/barcodes",
      icon: QrCode,
      variant: "outline" as const,
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Operational Quick Actions
          </h3>
        </div>
        <span className="text-xs text-muted-foreground">
          Frequent operations
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <Link key={act.id} href={act.href} className="block group">
              <div className="p-3 bg-background border border-border hover:border-primary/50 hover:bg-muted/30 rounded-lg transition-all flex items-start gap-3 h-full">
                <div className="p-2 bg-muted/60 text-foreground group-hover:bg-primary group-hover:text-primary-foreground rounded-md transition-colors shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {act.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">
                    {act.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
