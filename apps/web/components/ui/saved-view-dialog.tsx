'use client'

import * as React from 'react'
import { preferencesApi } from '@/lib/api/preferences-api'
import { BookmarkPlus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface SavedViewDialogProps {
  isOpen: boolean
  onClose: () => void
  module: string
  currentFilters?: Record<string, unknown>
  onViewSaved?: () => void
}

export function SavedViewDialog({
  isOpen,
  onClose,
  module,
  currentFilters = {},
  onViewSaved,
}: SavedViewDialogProps) {
  const [name, setName] = React.useState('')
  const [isDefault, setIsDefault] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  if (!isOpen) return null

  const handleSave = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      await preferencesApi.createSavedView({
        module,
        name,
        filtersJson: currentFilters,
        isDefault,
      })
      if (onViewSaved) onViewSaved()
      onClose()
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-10 px-4 animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Save Custom View Preset</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-foreground">View Preset Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Critical Low Stock (Chennai Warehouse)"
              className="w-full px-3 py-1.5 mt-1 bg-input border border-border rounded-md text-xs outline-none text-foreground focus:ring-1 focus:ring-primary"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded text-primary focus:ring-primary"
            />
            <span>Set as default view for {module}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading || !name.trim()}>
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save View Preset
          </Button>
        </div>
      </div>
    </div>
  )
}
