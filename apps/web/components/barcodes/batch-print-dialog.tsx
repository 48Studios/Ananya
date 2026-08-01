'use client'

import * as React from 'react'
import { Printer, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LabelPreview, LabelTemplate } from './label-preview'
import { barcodesApi, EntityType, LabelData, BarcodeFormat } from '@/lib/api/barcodes-api'

export interface BatchPrintDialogProps {
  isOpen: boolean
  onClose: () => void
  entityType: EntityType
  entityIds: string[]
  title?: string
}

export function BatchPrintDialog({
  isOpen,
  onClose,
  entityType,
  entityIds,
  title = 'Batch Label Print Studio',
}: BatchPrintDialogProps) {
  const [labels, setLabels] = React.useState<LabelData[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [template, setTemplate] = React.useState<LabelTemplate>('STANDARD')
  const [format, setFormat] = React.useState<BarcodeFormat>('CODE128')

  const fetchBatchLabels = React.useCallback(async () => {
    if (!isOpen || entityIds.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const data = await barcodesApi.getBatchLabels({
        entityType,
        ids: entityIds,
      })
      setLabels(data)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to generate batch label print queue.')
      }
    } finally {
      setLoading(false)
    }
  }, [isOpen, entityType, entityIds])

  React.useEffect(() => {
    fetchBatchLabels()
  }, [fetchBatchLabels])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">
                Printing {entityIds.length} {entityType.toLowerCase()} label(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/20 border border-border rounded-lg shrink-0">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Label Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as LabelTemplate)}
              className="w-full px-3 py-1.5 text-xs bg-input/40 border border-border rounded-md outline-none text-foreground"
            >
              <option value="STANDARD">Standard (2&quot; x 4&quot;)</option>
              <option value="COMPACT">Compact (1&quot; x 2&quot;)</option>
              <option value="DETAILED">Detailed (3&quot; x 4&quot;)</option>
              <option value="SHELF_BIN">Shelf Bin Tag</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Barcode Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as BarcodeFormat)}
              className="w-full px-3 py-1.5 text-xs bg-input/40 border border-border rounded-md outline-none text-foreground"
            >
              <option value="CODE128">Code 128 (High Density)</option>
              <option value="CODE39">Code 39 (Standard Alphanumeric)</option>
              <option value="EAN13">EAN-13 (13 Digits)</option>
              <option value="UPCA">UPC-A (12 Digits)</option>
            </select>
          </div>
        </div>

        {/* Content Preview List */}
        <div className="flex-1 overflow-y-auto min-h-[300px] p-4 bg-muted/10 border border-border rounded-xl">
          {loading ? (
            <div className="h-full flex items-center justify-center p-8 text-xs text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin text-primary" />
              Generating barcode & QR label queue...
            </div>
          ) : error ? (
            <div className="p-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center">
              {labels.map((lbl) => (
                <LabelPreview
                  key={lbl.id}
                  label={lbl}
                  template={template}
                  format={format}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border shrink-0">
          <span className="text-xs text-muted-foreground font-mono">
            Ready to print {labels.length} label(s)
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={loading || labels.length === 0}
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print Labels
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
