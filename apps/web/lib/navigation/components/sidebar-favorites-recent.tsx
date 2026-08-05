"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Star, Clock, ChevronRight } from "lucide-react";
import { useNavigation } from "../navigation-context";
import { cn } from "@/lib/utils";

interface SidebarFavoritesRecentProps {
  isCollapsed: boolean;
}

export function SidebarFavoritesRecent({
  isCollapsed,
}: SidebarFavoritesRecentProps) {
  const { pinnedItems, togglePinnedItem, recentItems, activePath, modules } =
    useNavigation();

  const [activeTab, setActiveTab] = useState<"favorites" | "recent">(
    "favorites",
  );

  if (isCollapsed) return null;

  // Helper: derive title and icon for any route href
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
    const title = href
      .replace(/^\//, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      title: title || "Dashboard",
      icon: <ChevronRight className="size-3.5 text-muted-foreground" />,
    };
  };

  const itemsToDisplay = activeTab === "favorites" ? pinnedItems : recentItems;

  // Omit container if both arrays are empty
  if (pinnedItems.length === 0 && recentItems.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5 pb-1">
      {/* Header with Favorites / Recent Switcher Tabs */}
      <div className="flex items-center justify-between px-3 h-6 text-[10px] font-semibold text-muted-foreground/75 uppercase tracking-widest shrink-0 select-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("favorites")}
            className={cn(
              "flex items-center gap-1 hover:text-foreground transition-colors",
              activeTab === "favorites"
                ? "text-amber-500 font-bold"
                : "text-muted-foreground",
            )}
          >
            <Star className="size-3 fill-current" />
            <span>Favorites ({pinnedItems.length})</span>
          </button>
          <span className="text-sidebar-border">|</span>
          <button
            type="button"
            onClick={() => setActiveTab("recent")}
            className={cn(
              "flex items-center gap-1 hover:text-foreground transition-colors",
              activeTab === "recent"
                ? "text-primary font-bold"
                : "text-muted-foreground",
            )}
          >
            <Clock className="size-3" />
            <span>Recent ({recentItems.length})</span>
          </button>
        </div>
      </div>

      {/* Item List */}
      <div className="space-y-0.5 px-1">
        {itemsToDisplay.length === 0 ? (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground/70 italic">
            {activeTab === "favorites"
              ? "No favorites pinned yet."
              : "No recent visits."}
          </div>
        ) : (
          itemsToDisplay.map((href) => {
            const details = getItemDetails(href);
            const isActive = activePath === href;
            const isPinned = pinnedItems.includes(href);

            return (
              <div
                key={href}
                className="group/item flex items-center justify-between gap-2 px-2.5 h-7.5 rounded-md text-xs transition-colors hover:bg-sidebar-accent/80"
              >
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 min-w-0 font-medium truncate flex-1 text-[11.5px]",
                    isActive
                      ? "text-sidebar-primary font-semibold"
                      : "text-sidebar-foreground/85",
                  )}
                >
                  <span className="shrink-0 size-3.5 flex items-center justify-center">
                    {details.icon}
                  </span>
                  <span className="truncate">{details.title}</span>
                </Link>

                <button
                  type="button"
                  onClick={() => togglePinnedItem(href)}
                  className={cn(
                    "p-0.5 rounded transition-opacity",
                    isPinned
                      ? "text-amber-500 hover:text-amber-600 opacity-100"
                      : "text-muted-foreground/50 hover:text-amber-500 opacity-0 group-hover/item:opacity-100",
                  )}
                  title={
                    isPinned ? "Remove from favorites" : "Pin to favorites"
                  }
                >
                  <Star
                    className={cn("size-3", isPinned && "fill-amber-500")}
                  />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
