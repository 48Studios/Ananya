"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Pause,
  Archive,
  FileText,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CanonicalStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "COMPLETED"
  | "SUCCESS"
  | "SCHEDULED"
  | "SUBMITTED"
  | "OPEN"
  | "IN_PROGRESS"
  | "PENDING"
  | "IN_REVIEW"
  | "ON_HOLD"
  | "PAUSED"
  | "OVERDUE"
  | "REJECTED"
  | "CANCELLED"
  | "FAILED"
  | "DRAFT"
  | "ARCHIVED"
  | string;

interface StatusBadgeProps {
  status: CanonicalStatus;
  label?: string;
  className?: string;
}

/**
 * The record-level active flag, as a pill.
 *
 * A master-data record's `isActive` flag is not a workflow status: it has two
 * values, it never carries an icon, and it is rendered beside other record
 * fields. `StatusBadge` maps a status vocabulary (PENDING, FULFILLED, …) onto
 * icons and colours, so feeding "INACTIVE" through it produced a document icon
 * next to the word Inactive. This keeps the two concerns apart while still
 * defining the Active/Inactive palette exactly once, so every record page shows
 * the same size and the same colours.
 */
export function RecordStatusBadge({
  isActive,
  className,
}: {
  isActive: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full",
        isActive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
          : "bg-muted text-muted-foreground border border-border",
        className,
      )}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const normalized = (status || "").toUpperCase();
  const displayLabel = label || status || "UNKNOWN";

  let variantStyles = "bg-muted text-muted-foreground border-border";
  let IconComponent = FileText;

  if (
    [
      "ACTIVE",
      "COMPLETED",
      "SUCCESS",
      "FULFILLED",
      "APPROVED",
      "RESOLVED",
      "CREDITED",
      "DELIVERED",
      "PAID",
    ].includes(normalized)
  ) {
    variantStyles =
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    IconComponent = CheckCircle2;
  } else if (
    [
      "PENDING",
      "IN_REVIEW",
      "ON_HOLD",
      "PAUSED",
      "OVERDUE",
      "SHORTAGE",
      "PARTIALLY_RECEIVED",
    ].includes(normalized)
  ) {
    variantStyles =
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    IconComponent = normalized === "PAUSED" ? Pause : Clock;
  } else if (
    ["REJECTED", "CANCELLED", "FAILED", "BLOCKED", "UNPAID"].includes(
      normalized,
    )
  ) {
    variantStyles =
      "bg-destructive/10 text-destructive dark:text-destructive border-destructive/20";
    IconComponent = XCircle;
  } else if (
    [
      "SCHEDULED",
      "SUBMITTED",
      "OPEN",
      "IN_PROGRESS",
      "ISSUED",
      "DISPATCHED",
    ].includes(normalized)
  ) {
    variantStyles =
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
    IconComponent = normalized === "IN_PROGRESS" ? RefreshCw : Clock;
  } else if (normalized === "ARCHIVED") {
    variantStyles = "bg-muted text-muted-foreground border-border";
    IconComponent = Archive;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border",
        variantStyles,
        className,
      )}
    >
      <IconComponent className="w-3 h-3 mr-1 shrink-0" />
      {displayLabel}
    </span>
  );
}
