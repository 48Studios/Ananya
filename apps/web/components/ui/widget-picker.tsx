'use client'

import * as React from 'react'
import { DashboardWidgetConfig } from '@/lib/api/preferences-api'
import { X, Eye, EyeOff, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface WidgetPickerProps {
  isOpen: boolean
  onClose: () => void
  widgets: DashboardWidgetConfig[]
  onToggleWidget: (id: string, enabled: boolean) => void
  onRestoreDefaults: () => void
}

export function WidgetPicker({
  isOpen,
  onClose,
  widgets,
  onToggleWidget,
  onRestoreDefaults,
}: WidgetPickerProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-10 px-4 animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Customize Dashboard Widgets</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Toggle visibility for widgets displayed on your personal ERP dashboard.
          </p>

          <div className="border border-border rounded-xl divide-y divide-border bg-muted/10 overflow-hidden">
            {widgets.map((w) => (
              <div key={w.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="font-semibold text-foreground">{w.title}</span>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">Width: {w.width}</div>
                </div>

                <Button
                  size="sm"
                  variant={w.enabled ? 'outline' : 'secondary'}
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

        <div className="flex justify-between items-center pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onRestoreDefaults} className="text-xs text-muted-foreground">
            Restore Defaults
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
