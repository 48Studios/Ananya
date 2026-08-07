"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      title={title}
      description={description}
      size="sm"
      closeDisabled={loading}
    >
      <DialogShellBody className="flex items-start gap-3">
        <div
          className={`rounded-full p-2 ${
            variant === "destructive"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}
        >
          <AlertTriangle className="size-5" />
        </div>
        <p className="pt-1 text-sm text-muted-foreground">{description}</p>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={loading}>
          {cancelText}
        </DialogShellCancelButton>
        <Button
          variant={variant === "destructive" ? "destructive" : "default"}
          size="sm"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          {confirmText}
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
