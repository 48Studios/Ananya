"use client";

import React from "react";
import Link from "next/link";
import { QuickAction } from "../types";

interface SidebarQuickActionsProps {
  actions: QuickAction[];
  isCollapsed: boolean;
}

export function SidebarQuickActions({
  actions,
  isCollapsed,
}: SidebarQuickActionsProps) {
  if (isCollapsed || !actions || actions.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 px-3 py-1">
      {actions.map((action) => (
        <Link
          key={action.id}
          href={action.href || "#"}
          className="flex flex-col items-center justify-center p-2.5 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 hover:bg-sidebar-accent hover:border-sidebar-border transition-all duration-150 group text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="size-4 mb-1 text-sidebar-foreground/80 group-hover:text-sidebar-primary group-hover:scale-105 transition-all duration-150 flex items-center justify-center">
            {action.icon}
          </div>
          <span className="text-[11px] font-medium text-sidebar-foreground/90 truncate max-w-full leading-tight">
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
