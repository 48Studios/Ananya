"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-5 shadow-xs transition-colors",
        className,
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="w-full min-h-[240px] flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
