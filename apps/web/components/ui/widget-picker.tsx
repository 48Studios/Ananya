"use client";

import * as React from "react";
import { DashboardWidgetConfig } from "@/lib/api/preferences-api";
import { Eye, EyeOff, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";

export interface WidgetPickerProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: DashboardWidgetConfig[];
  onToggleWidget: (id: string, enabled: boolean) => void;
  onRestoreDefaults: () => void;
}

export function WidgetPicker({
  isOpen,
  onClose,
  widgets,
  onToggleWidget,
  onRestoreDefaults,
}: WidgetPickerProps) {
  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Customize Dashboard Widgets"
      description="Choose which widgets remain visible in your personal dashboard workspace."
      size="md"
    >
      <DialogShellBody className="space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <LayoutGrid className="size-5" />
          <span className="text-sm font-medium text-foreground">
            Widget visibility
          </span>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Toggle visibility for widgets displayed on your personal ERP
            dashboard.
          </p>

          <div className="border border-border rounded-xl divide-y divide-border bg-muted/10 overflow-hidden">
            {widgets.map((w) => (
              <div
                key={w.id}
                className="p-3.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <span className="font-semibold text-foreground">
                    {w.title}
                  </span>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">
                    Width: {w.width}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant={w.enabled ? "outline" : "secondary"}
                  onClick={() => onToggleWidget(w.id, !w.enabled)}
                  className="h-7 text-xs"
                >
                  {w.enabled ? (
                    <>
                      <Eye className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                      Visible
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                      Hidden
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestoreDefaults}
          className="text-xs text-muted-foreground"
        >
          Restore Defaults
        </Button>
        <DialogShellCancelButton />
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
