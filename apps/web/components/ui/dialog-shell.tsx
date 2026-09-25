"use client";

import * as React from "react";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const dialogShellWidthClasses = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
  xl: "sm:max-w-6xl",
} as const;

export type DialogShellSize = keyof typeof dialogShellWidthClasses;

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
  size?: DialogShellSize;
  closeDisabled?: boolean;
  contentClassName?: string;
  /** Leading icon rendered in a tinted square beside the title. */
  icon?: React.ReactNode;
  /**
   * Actions rendered at the trailing edge of the header, before the close
   * button. Header padding already reserves the close button's space, so
   * actions never collide with it.
   */
  headerActions?: React.ReactNode;
}

export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  closeDisabled = false,
  contentClassName,
  icon,
  headerActions,
}: DialogShellProps) {
  const hasRichHeader = Boolean(icon || headerActions);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && closeDisabled) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] min-h-[12rem] flex-col gap-0 overflow-hidden p-0",
          dialogShellWidthClasses[size],
          contentClassName,
        )}
      >
        <DialogHeader className="relative shrink-0 px-6 py-5 pr-14">
          {hasRichHeader ? (
            <div className="flex items-center gap-3">
              {icon ? (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/15 text-primary">
                  {icon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <DialogTitle className="font-semibold">{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              {headerActions ? (
                <div className="flex shrink-0 items-center gap-2">
                  {headerActions}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </>
          )}
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "absolute right-4",
                  // The rich header is taller because of the icon square, so the
                  // close button is centred against it instead of pinned to the
                  // top. The plain header keeps its original position.
                  //
                  // Centring uses auto margins rather than `top-1/2
                  // -translate-y-1/2` on purpose: Button's own
                  // `active:translate-y-px` writes the same `--tw-translate-y`
                  // variable, so on press it would replace the -50% offset and
                  // drop the button by half its height. Auto margins leave
                  // transform free for the 1px press nudge.
                  hasRichHeader ? "inset-y-0 my-auto" : "top-4",
                )}
                disabled={closeDisabled}
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>
        <Separator />
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function DialogShellBody({
  className,
  scrollable = true,
  ...props
}: React.ComponentProps<"div"> & {
  /**
   * Whether the body itself scrolls. Leave `true` for ordinary dialogs.
   *
   * Set `false` when the body holds one region that should own the scroll (a
   * queue's item list, for example). The body then becomes a flex column with
   * the fixed chrome pinned and no scrollbar of its own, so the dialog never
   * shows two nested scrollbars.
   */
  scrollable?: boolean;
}) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        className,
        "min-h-0 flex-1 px-6 py-5",
        scrollable ? "overflow-y-auto" : "flex flex-col gap-4 overflow-hidden",
      )}
      {...props}
    />
  );
}

export function DialogShellFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <>
      <Separator className="shrink-0" />
      <DialogFooter
        className={cn(
          "mx-0 mb-0 flex-row items-center justify-end gap-2 rounded-none border-0 bg-transparent px-6 py-5 shrink-0",
          className,
        )}
        {...props}
      />
    </>
  );
}

export function DialogShellCancelButton({
  className,
  children = "Cancel",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <DialogClose
      render={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          {...props}
        />
      }
    >
      {children}
    </DialogClose>
  );
}
