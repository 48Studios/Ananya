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
}: DialogShellProps) {
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-4 right-4"
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
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        className,
        "min-h-0 flex-1 overflow-y-auto px-6 py-5",
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
      <Separator />
      <DialogFooter
        className={cn(
          className,
          "mx-0 mb-0 flex-row items-center justify-end gap-2 rounded-none border-0 bg-transparent px-6 py-5",
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
