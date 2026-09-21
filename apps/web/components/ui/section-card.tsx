"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  /** Section title. Rendered at a fixed size so every section reads alike. */
  title: string;
  /** One line explaining what the section contains. */
  description?: React.ReactNode;
  /**
   * Leading icon. Rendered at a fixed 16px beside the title; the primitive owns
   * the colour so no section can drift to a different accent.
   */
  icon?: React.ComponentType<{ className?: string }>;
  /** Section-level actions, aligned to the trailing edge of the header. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Overrides the content region's padding.
   *
   * Tables pass `p-0` because their cells already carry the horizontal inset,
   * and a padded wrapper would double it.
   */
  contentClassName?: string;
  className?: string;
}

/**
 * One titled block of a record page.
 *
 * A detail page is a stack of sections that must read as a single document, so
 * the header structure — icon, title, description, actions, full-width
 * separator — lives here rather than being re-typed per section. Sections
 * differ only in their content; an empty section keeps the same header and
 * separator as a populated one, which is what makes the page scan vertically.
 *
 * Height is never fixed: the card grows with its content.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  contentClassName,
  className,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
            {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className={cn("px-6 py-5", contentClassName)}>{children}</div>
    </section>
  );
}

export interface SectionCardFooterProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * The inset footer of a section card, below a full-width rule.
 *
 * Used for record bookkeeping (when the record was created and last updated)
 * rather than for content the section is about. It belongs to the card module
 * so the rule, the inset padding and the quiet type are never re-typed by a
 * page.
 */
export function SectionCardFooter({
  children,
  className,
}: SectionCardFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-4 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The standard created/updated pair for a record card's footer. */
export function RecordTimestamps({
  createdAt,
  updatedAt,
}: {
  createdAt: string;
  updatedAt: string;
}) {
  return (
    <>
      <span>Created: {new Date(createdAt).toLocaleString()}</span>
      <span>Updated: {new Date(updatedAt).toLocaleString()}</span>
    </>
  );
}
