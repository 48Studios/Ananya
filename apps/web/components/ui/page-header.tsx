"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  /**
   * Parent route for the compact back arrow shown beside the title.
   * Omit on top-level pages; the control is only rendered when provided.
   */
  backHref?: string;
  /** Accessible name and tooltip for the back control, e.g. "Back to Customers". */
  backLabel?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
}: PageHeaderProps) {
  const backTitle = backLabel ?? "Back";

  return (
    <div className="space-y-2 pb-4 border-b border-border/40">
      {/* Main Title & Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {backHref && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 print:hidden"
              aria-label={backTitle}
              title={backTitle}
              nativeButton={false}
              render={<Link href={backHref} />}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
