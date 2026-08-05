"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { NavigationModule } from "../types";

interface NavigationRailItemProps {
  module: NavigationModule;
  isActive: boolean;
  onClick: () => void;
}

export function NavigationRailItem({
  module,
  isActive,
  onClick,
}: NavigationRailItemProps) {
  return (
    <div className="relative flex items-center justify-center w-full py-1">
      <Link
        href={module.defaultRoute}
        onClick={onClick}
        aria-label={module.name}
        className={cn(
          "relative flex items-center justify-center size-10 rounded-lg transition-colors duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shrink-0",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-2xs"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <div className="size-5 flex items-center justify-center shrink-0">
          {module.icon}
        </div>
      </Link>

      {/* Active Left Indicator Pill - Smooth opacity fade without layout shift */}
      <div
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-0.9 h-5 bg-sidebar-primary rounded-r-full transition-opacity duration-150 ease-out pointer-events-none",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Hover Tooltip */}
      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-popover text-popover-foreground text-xs font-medium rounded-md shadow-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 z-50 border border-border">
        {module.name}
      </div>
    </div>
  );
}
