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
        "bg-card border border-border rounded-xl p-4 shadow-xs transition-colors hover:border-border/80 flex flex-col justify-between",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-medium text-muted-foreground truncate"
          title={title}
        >
          {title}
        </span>
        {icon && (
          <div className="size-7 flex items-center justify-center rounded-md bg-muted/50 text-muted-foreground shrink-0">
            {renderIcon()}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
          {value}
        </h3>
        {trend && (
          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded shrink-0",
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
        <p className="text-xs text-muted-foreground mt-1 truncate" title={subtitle}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
