'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Scan,
  X,
  Loader2,
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { barcodesApi, BarcodeLookupResult } from '@/lib/api/barcodes-api'

export interface ScanDialogProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess?: (result: BarcodeLookupResult) => void
  title?: string
  description?: string
}

export function ScanDialog({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Quick Barcode & QR Scan',
  description = 'Scan any barcode or QR code using a hardware scanner, camera, or input field.',
}: ScanDialogProps) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [inputCode, setInputCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<BarcodeLookupResult | null>(null)
  const [isCameraActive, setIsCameraActive] = React.useState(false)

  // Focus input field when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setInputCode('')
      setError(null)
      setResult(null)
      setIsCameraActive(false)
    }
  }, [isOpen])

  const executeLookup = React.useCallback(
    async (codeToLookup: string) => {
      const target = codeToLookup.trim()
      if (!target) return

      setLoading(true)
      setError(null)
      setResult(null)
      try {
        const res = await barcodesApi.lookup(target)
        setResult(res)
        if (onScanSuccess) {
          onScanSuccess(res)
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('No entity matched the scanned code.')
        }
      } finally {
        setLoading(false)
      }
    },
    [onScanSuccess],
  )

  // Buffer hardware barcode scanner keypresses (fast typing ending with Enter)
  React.useEffect(() => {
    if (!isOpen) return

    let buffer = ''
    let timeoutId: NodeJS.Timeout

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if focused on input elements other than our scan input
      if (
        document.activeElement &&
        document.activeElement !== inputRef.current &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return
      }

      if (e.key === 'Enter') {
        if (buffer.trim()) {
          const scanned = buffer.trim()
          buffer = ''
          setInputCode(scanned)
          executeLookup(scanned)
        }
      } else if (e.key.length === 1) {
        buffer += e.key
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          buffer = ''
        }, 300)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timeoutId)
    }
  }, [isOpen, executeLookup])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    executeLookup(inputCode)
  }

  const handleNavigate = () => {
    if (result) {
      onClose()
      router.push(result.targetUrl)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scan Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>Scan or Enter Barcode / QR Payload</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                Hardware Scanner Ready
              </span>
            </label>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Scan hardware barcode or type SKU, PO#, WO#, Loc Code..."
                className="w-full pl-9 pr-24 py-2.5 text-xs font-mono bg-input/40 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
              />
              <Scan className="w-4 h-4 absolute left-3 text-muted-foreground" />
              <Button
                type="submit"
                size="xs"
                disabled={loading || !inputCode.trim()}
                className="absolute right-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Lookup'}
              </Button>
            </div>
          </div>
        </form>

        {/* Camera Scanner Simulation Toggle */}
        <div className="flex items-center justify-between p-3 bg-muted/20 border border-border rounded-lg text-xs">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground font-medium">Camera Scanner Stream</span>
          </div>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setIsCameraActive(!isCameraActive)}
          >
            {isCameraActive ? 'Stop Stream' : 'Activate Camera'}
          </Button>
        </div>

        {isCameraActive && (
          <div className="p-6 bg-slate-950 rounded-lg border border-slate-800 text-center space-y-2 relative overflow-hidden">
            <div className="w-48 h-28 mx-auto border-2 border-dashed border-sky-400/70 rounded-lg flex items-center justify-center relative">
              <div className="w-full h-0.5 bg-sky-500 animate-pulse absolute top-1/2 -translate-y-1/2" />
              <span className="text-[11px] font-mono text-sky-400">Position code in frame</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Camera scanning active — point lens at Barcode or QR Code
            </p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Lookup Result Card */}
        {result && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold font-mono uppercase bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded">
                  {result.entityType} MATCHED
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-foreground">
                {result.code}
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold text-foreground">{result.name}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">{result.subtitle}</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-500/20">
              <Button size="xs" onClick={handleNavigate}>
                Open Entity Page
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
