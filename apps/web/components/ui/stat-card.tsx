"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: StatCardProps) {
  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    const IconComponent = icon as React.ComponentType<{ className?: string }>;
    return <IconComponent className="w-4 h-4" />;
  };

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl p-5 shadow-xs transition-colors hover:border-border/80",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
        {icon && (
          <div className="p-2 bg-muted/50 rounded-lg text-muted-foreground">
            {renderIcon()}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <h3 className="text-2xl font-bold tracking-tight text-foreground">
          {value}
        </h3>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              trend.positive
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-400",
            )}
          >
            {trend.value}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}
