"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Star,
  Clock,
  ChevronRight,
  RotateCcw,
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Factory,
  FolderKanban,
  FileText,
  Settings,
  Users,
  ShieldCheck,
  Bell,
  QrCode,
  ArrowRightLeft,
  Warehouse,
  ClipboardList,
  Layers,
  Tag,
  ArrowDownLeft,
  Receipt,
  Wrench,
  BadgeCheck,
} from "lucide-react";
import { useNavigation } from "../navigation-context";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface SidebarFavoritesRecentProps {
  isCollapsed: boolean;
  onItemClick?: () => void;
}

// Fallback route icon map for instantaneous icon resolution
const ROUTE_ICON_MAP: Record<string, React.ReactNode> = {
  "/dashboard": <LayoutDashboard className="size-4" />,
  "/activity": <FileText className="size-4" />,
  "/audit": <ShieldCheck className="size-4" />,
  "/notifications": <Bell className="size-4" />,
  "/barcodes": <QrCode className="size-4" />,
  "/inventory": <Boxes className="size-4" />,
  "/components": <Boxes className="size-4" />,
  "/transactions": <ArrowRightLeft className="size-4" />,
  "/warehouses": <Warehouse className="size-4" />,
  "/warehouse-transfers": <ArrowRightLeft className="size-4" />,
  "/stock-counts": <ClipboardList className="size-4" />,
  "/cycle-counts": <ClipboardList className="size-4" />,
  "/stock-adjustments": <RotateCcw className="size-4" />,
  "/batches": <Layers className="size-4" />,
  "/serials": <Tag className="size-4" />,
  "/categories": <Tag className="size-4" />,
  "/procurement": <ShoppingCart className="size-4" />,
  "/purchase-orders": <ShoppingCart className="size-4" />,
  "/goods-receipts": <ArrowDownLeft className="size-4" />,
  "/purchase-invoices": <Receipt className="size-4" />,
  "/supplier-returns": <RotateCcw className="size-4" />,
  "/suppliers": <Users className="size-4" />,
  "/manufacturing": <Factory className="size-4" />,
  "/boms": <Layers className="size-4" />,
  "/work-orders": <Factory className="size-4" />,
  "/material-consumption": <Layers className="size-4" />,
  "/maintenance": <Wrench className="size-4" />,
  "/projects": <FolderKanban className="size-4" />,
  "/sales-orders": <Receipt className="size-4" />,
  "/quotations": <Receipt className="size-4" />,
  "/customers": <Users className="size-4" />,
  "/warranty": <BadgeCheck className="size-4" />,
  "/rma": <RotateCcw className="size-4" />,
  "/service": <Wrench className="size-4" />,
  "/reports": <FileText className="size-4" />,
  "/users": <Users className="size-4" />,
  "/roles": <ShieldCheck className="size-4" />,
  "/settings": <Settings className="size-4" />,
  "/settings/security": <ShieldCheck className="size-4" />,
  "/data-operations": <RotateCcw className="size-4" />,
};

export function SidebarFavoritesRecent({
  isCollapsed,
  onItemClick,
}: SidebarFavoritesRecentProps) {
  const {
    pinnedItems,
    togglePinnedItem,
    isItemPinned,
    recentItems,
    clearRecents,
    activePath,
    modules,
  } = useNavigation();

  // Default to favorites if available, otherwise recent
  const [activeTab, setActiveTab] = useState<"favorites" | "recent">("favorites");

  if (isCollapsed) return null;

  // Completely omit if both arrays are empty
  if (pinnedItems.length === 0 && recentItems.length === 0) {
    return null;
  }

  // Derive title and icon for any route href
  const getItemDetails = (href: string) => {
    for (const mod of modules) {
      for (const section of mod.sidebar) {
        if (!section.items) continue;
        for (const item of section.items) {
          if (item.href === href) return { title: item.title, icon: item.icon };
          if (item.children) {
            for (const child of item.children) {
              if (child.href === href)
                return { title: child.title, icon: child.icon };
            }
          }
        }
      }
    }

    if (ROUTE_ICON_MAP[href]) {
      const title = href
        .replace(/^\//, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        title: title || "Dashboard",
        icon: ROUTE_ICON_MAP[href],
      };
    }

    const formattedTitle = href
      .replace(/^\//, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return {
      title: formattedTitle || "Dashboard",
      icon: <ChevronRight className="size-4 text-muted-foreground" />,
    };
  };

  const itemsToDisplay = activeTab === "favorites" ? pinnedItems : recentItems;

  return (
    <div className="space-y-1.5 pb-1 select-none">
      {/* Segmented Pill Switcher */}
      <div className="px-1">
        <div className="flex items-center p-1 text-xs border border-solid border-secondary rounded-md">
          <button
            type="button"
            onClick={() => setActiveTab("favorites")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-medium transition-all outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
              activeTab === "favorites"
                ? "bg-transparent text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Star
              className={cn(
                "size-3 shrink-0",
                pinnedItems.length > 0 ? "fill-amber-500 text-amber-500" : "text-muted-foreground",
              )}
            />
            <span>Favorites</span>
            {pinnedItems.length > 0 && (
              <span className="font-mono text-[9px] px-1 py-0.2 rounded-full bg-muted text-muted-foreground leading-none">
                {pinnedItems.length}
              </span>
            )}
          </button>
          <Separator orientation="vertical" className="h-full" />
          <button
            type="button"
            onClick={() => setActiveTab("recent")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-medium transition-all outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
              activeTab === "recent"
                ? "bg-transparent text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Clock className="size-3 shrink-0 text-muted-foreground" />
            <span>Recent</span>
            {recentItems.length > 0 && (
              <span className="font-mono text-[9px] px-1 py-0.2 rounded-full bg-muted text-muted-foreground leading-none">
                {recentItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Contextual Subheader for Recent Tab */}
      {activeTab === "recent" && recentItems.length > 0 && (
        <div className="flex items-center justify-between px-2.5 pt-0.5 text-[10px] text-muted-foreground">
          <span className="font-medium uppercase tracking-wider text-[9.5px]">Visited Pages</span>
          <button
            type="button"
            onClick={clearRecents}
            className="hover:text-destructive transition-colors text-[10px] font-medium"
            title="Clear recently visited pages"
          >
            Clear
          </button>
        </div>
      )}

      {/* Item List */}
      <div className="space-y-0.5 px-1">
        {itemsToDisplay.length === 0 ? (
          <div className="px-2 py-3 text-center rounded-lg border border-dashed border-sidebar-border/80 bg-sidebar-accent/20 space-y-1">
            <div className="flex justify-center text-muted-foreground/60">
              {activeTab === "favorites" ? (
                <Star className="size-3.5" />
              ) : (
                <Clock className="size-3.5" />
              )}
            </div>
            <p className="text-[11px] font-medium text-sidebar-foreground/80">
              {activeTab === "favorites"
                ? "No favorites pinned yet"
                : "No recent pages visited"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight px-1">
              {activeTab === "favorites"
                ? "Click the pin icon on any page in the sidebar to add shortcuts here."
                : "Pages you navigate to will automatically show up here."}
            </p>
          </div>
        ) : (
          itemsToDisplay.map((href) => {
            const details = getItemDetails(href);
            const isExact = href === "/" || href === "/dashboard";
            const isActive = isExact
              ? activePath === href
              : activePath === href || (href !== "/" && activePath.startsWith(href + "/"));
            const isPinned = isItemPinned(href);

            return (
              <div
                key={href}
                className="group/item relative flex items-center w-full"
              >
                <Link
                  href={href}
                  onClick={onItemClick}
                  className={cn(
                    "w-full flex items-center justify-between gap-2.5 h-8 px-2.5 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs"
                      : "text-sidebar-foreground/85 font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={cn(
                        "shrink-0 size-4 flex items-center justify-center",
                        isActive
                          ? "text-sidebar-primary-foreground"
                          : "text-muted-foreground group-hover/item:text-sidebar-foreground",
                      )}
                    >
                      {details.icon}
                    </span>
                    <span className="truncate text-xs">{details.title}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {activeTab === "favorites" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePinnedItem(href);
                        }}
                        className={cn(
                          "p-1 rounded transition-all",
                          isActive
                            ? "text-sidebar-primary-foreground hover:bg-white/20"
                            : "text-amber-500 hover:text-destructive hover:bg-black/10 dark:hover:bg-white/10 opacity-70 group-hover/item:opacity-100",
                        )}
                        title="Remove from favorites"
                      >
                        <Star className="size-3 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePinnedItem(href);
                        }}
                        className={cn(
                          "p-1 rounded transition-all",
                          isPinned
                            ? "text-amber-500 opacity-100"
                            : isActive
                              ? "text-sidebar-primary-foreground/70 hover:text-sidebar-primary-foreground hover:bg-white/20 opacity-0 group-hover/item:opacity-100"
                              : "text-muted-foreground hover:text-amber-500 hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover/item:opacity-100",
                        )}
                        title={isPinned ? "In favorites" : "Pin to favorites"}
                      >
                        <Star
                          className={cn(
                            "size-3",
                            isPinned ? "fill-amber-500" : "fill-none",
                          )}
                        />
                      </button>
                    )}
                  </div>
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
