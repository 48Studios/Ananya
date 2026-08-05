"use client";

import * as React from "react";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  Check,
} from "lucide-react";
import { NotificationDto } from "@/lib/api/notifications-api";

export interface NotificationCardProps {
  notification: NotificationDto;
  onMarkRead?: (id: string) => void;
}

export function NotificationCard({
  notification,
  onMarkRead,
}: NotificationCardProps) {
  const getIcon = () => {
    switch (notification.type) {
      case "SUCCESS":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "WARNING":
      case "LOW_STOCK":
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case "ERROR":
        return <AlertOctagon className="w-4 h-4 text-destructive shrink-0" />;
      case "APPROVAL_REQUIRED":
        return <ShieldCheck className="w-4 h-4 text-primary shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
    }
  };

  return (
    <div
      className={`p-3.5 border rounded-xl shadow-2xs transition-all flex items-start gap-3 ${
        notification.isRead
          ? "bg-card border-border opacity-75"
          : "bg-card border-primary/40 dark:bg-muted/10"
      }`}
    >
      <div className="mt-0.5">{getIcon()}</div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-foreground truncate">
            {notification.title}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {new Date(notification.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>

        <div className="flex items-center justify-between pt-1 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-muted/40 border border-border font-mono text-[10px] uppercase text-muted-foreground">
            {notification.module}
          </span>

          <div className="flex items-center gap-1">
            {!notification.isRead && onMarkRead && (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                className="p-1 text-muted-foreground hover:text-primary transition-colors"
                title="Mark as Read"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
