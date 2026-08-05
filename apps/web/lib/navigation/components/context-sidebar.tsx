"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigation } from "../navigation-context";
import { SidebarSection } from "./sidebar-section";
import { NAV_TOKENS } from "../tokens";
import { NavigationItem, SidebarSection as SidebarSectionType } from "../types";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils";

export function ContextSidebar({ onItemClick }: { onItemClick?: () => void }) {
  const {
    currentModule,
    currentModuleId,
    isSidebarCollapsed,
    toggleSidebarCollapse,
    pinnedItems,
    recentItems,
  } = useNavigation();
  const { hasPermission } = useAuth();

  // Helper: check if a navigation item is visible given permissions
  const isItemVisible = (item: NavigationItem): boolean => {
    if (item.permissions && item.permissions.length > 0) {
      if (!item.permissions.some((p) => hasPermission(p))) return false;
    }
    if (item.children && item.children.length > 0) {
      return item.children.some((child) => isItemVisible(child));
    }
    return true;
  };

  // Filter sections to ONLY those that will render meaningful content
  const visibleSections = currentModule.sidebar.filter(
    (section: SidebarSectionType) => {
      if (section.type === "quick_stats") {
        return (
          !isSidebarCollapsed &&
          ((section.quickStats && section.quickStats.length > 0) ||
            [
              "inventory",
              "procurement",
              "manufacturing",
              "projects",
              "dashboard",
            ].includes(currentModuleId))
        );
      }
      if (section.type === "quick_actions") {
        return (
          !isSidebarCollapsed &&
          !!section.quickActions &&
          section.quickActions.length > 0
        );
      }
      if (
        section.type === "favorites" ||
        section.type === "recent" ||
        section.type === "pinned"
      ) {
        return (
          !isSidebarCollapsed &&
          (pinnedItems.length > 0 || recentItems.length > 0)
        );
      }
      if (section.type === "nav") {
        return (
          !!section.items && section.items.some((item) => isItemVisible(item))
        );
      }
      return true;
    },
  );

  return (
    <aside
      className={cn(
        "h-screen bg-sidebar border-r border-sidebar-border/80 flex flex-col transition-all duration-200 ease-out select-none z-20 shrink-0 overflow-hidden",
        isSidebarCollapsed
          ? NAV_TOKENS.SIDEBAR_COLLAPSED_WIDTH
          : NAV_TOKENS.SIDEBAR_EXPANDED_WIDTH,
      )}
    >
      {/* Sidebar Header: Clean module title & collapse button */}
      <div
        className={cn(
          NAV_TOKENS.HEADER_HEIGHT,
          "px-3.5 flex items-center shrink-0 border-b border-sidebar-border/40",
          isSidebarCollapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        {isSidebarCollapsed ? (
          <button
            type="button"
            onClick={toggleSidebarCollapse}
            className="p-1.5 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shrink-0"
            title="Expand sidebar (280px)"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="size-4" />
          </button>
        ) : (
          <>
            <h2 className="font-semibold text-base text-sidebar-foreground truncate tracking-tight flex-1">
              {currentModule.name}
            </h2>

            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="p-1.5 rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shrink-0"
              title="Collapse sidebar (72px)"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </button>
          </>
        )}
      </div>

      {/* Sidebar Content Sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
        {visibleSections.map((section, idx) => (
          <SidebarSection
            key={section.id}
            section={section}
            isCollapsed={isSidebarCollapsed}
            isFirst={idx === 0}
            onItemClick={onItemClick}
          />
        ))}
      </div>
    </aside>
  );
}
