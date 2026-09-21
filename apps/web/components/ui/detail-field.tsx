"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The label/value vocabulary shared by every record detail page.
 *
 * A detail page is read field by field, so the pairing of a quiet label with a
 * dominant value has to be identical everywhere. Before this module each page
 * re-typed the same `dt`/`dd` classes, which is how the master-data pages
 * drifted from Component Details. These four components define that pairing
 * once; pages choose the value presentation that matches the data (an
 * identifier, prose, an empty marker) instead of re-inventing the typography.
 *
 * The grid is the responsive rule: one column on a phone, two on a tablet and
 * up to four on a wide desktop, so a short record does not stretch a single
 * field across 1200px and a long one does not need to be clipped.
 */

export interface DetailFieldsProps {
  children: React.ReactNode;
  className?: string;
}

/** The field grid for one section. */
export function DetailFields({ children, className }: DetailFieldsProps) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export interface DetailFieldProps {
  label: string;
  children: React.ReactNode;
  /** Grid placement, e.g. `sm:col-span-2` for a description. */
  className?: string;
}

/** One labelled value: muted label, stronger value directly underneath. */
export function DetailField({ label, children, className }: DetailFieldProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

export interface DetailValueProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * A readable prose value.
 *
 * Wraps rather than truncates: a clipped supplier name or description is worse
 * than a taller field.
 */
export function DetailText({ children, className }: DetailValueProps) {
  return (
    <span className={cn("text-sm break-words text-foreground", className)}>
      {children}
    </span>
  );
}

/** A code, SKU or identifier: the strongest value treatment on a page. */
export function DetailMono({ children, className }: DetailValueProps) {
  return (
    <span
      className={cn(
        "font-mono text-xs font-semibold break-words text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** An empty value. Reads as "nothing is recorded", not as a missing field. */
export function DetailMuted({ children }: DetailValueProps) {
  return (
    <span className="text-xs text-muted-foreground italic">{children}</span>
  );
}

export interface DetailChipProps {
  children: React.ReactNode;
  /** Monospace for codes; the chip itself stays one size everywhere. */
  mono?: boolean;
  /** Hover hint, for example the rule behind an inherited value. */
  title?: string;
  className?: string;
}

/**
 * A quiet inline label: a record identifier, a classification, a scope note.
 *
 * Deliberately neutral. Rendered at one size and one weight so a chip in a
 * field, a table cell or a list row reads the same, and so it can never be
 * mistaken for a status badge.
 */
export function DetailChip({
  children,
  mono,
  title,
  className,
}: DetailChipProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        mono && "font-mono",
        className,
      )}
    >
      {children}
    </span>
  );
}
