"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type DialogSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

const dialogSizeMap: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
  "2xl": "sm:max-w-4xl",
  full: "sm:max-w-6xl",
};

export interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: DialogSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
  showCloseButton = true,
  className,
  bodyClassName,
}: DialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={showCloseButton}
        className={cn(
          "flex max-h-[85vh] flex-col gap-0 p-0 overflow-hidden",
          dialogSizeMap[size],
          className,
        )}
      >
        <DialogHeader className="p-4 sm:p-6 pb-4 shrink-0 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? "" : "sr-only"}>
            {description || title}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <div
          className={cn(
            "flex-1 overflow-y-auto p-4 sm:p-6 space-y-4",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer !== undefined && (
          <>
            <Separator />
            <DialogFooter className="p-4 sm:p-6 bg-muted/30 shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              {footer}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
