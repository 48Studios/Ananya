'use client'

import * as React from 'react'
import { Upload, Loader2, X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { documentsApi } from '@/lib/api/documents-api'

export interface FileUploaderProps {
  entityType: string
  entityId: string
  onUploadSuccess?: () => void
}

export function FileUploader({
  entityType,
  entityId,
  onUploadSuccess,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null)

  const processFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      setErrorMsg('File exceeds maximum size of 50MB')
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const result = evt.target?.result as string
        const base64Data = result.split(',')[1] || result

        await documentsApi.uploadDocument({
          entityType,
          entityId,
          title: file.name,
          fileName: file.name,
          fileContent: base64Data,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        })

        setSuccessMsg(`Successfully uploaded ${file.name}`)
        if (onUploadSuccess) onUploadSuccess()
        setTimeout(() => setSuccessMsg(null), 3000)
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processFile(files[0]!)
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items
    for (let i = 0; i < items.length; i++) {
      if (items[i]!.type.indexOf('image') !== -1) {
        const file = items[i]!.getAsFile()
        if (file) {
          processFile(file)
        }
      }
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
      className={`border-2 border-dashed rounded-xl p-6 text-center transition-all outline-none ${
        isDragging
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:border-primary/50'
      }`}
    >
      <div className="flex flex-col items-center justify-center gap-2">
        {loading ? (
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        ) : (
          <Upload className="w-8 h-8 text-muted-foreground/60" />
        )}
        <div>
          <p className="text-xs font-semibold text-foreground">
            Drag & Drop files or <span className="text-primary cursor-pointer hover:underline">browse</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Supports PDF, Images, CAD (STEP, STL), CSV, Excel & Docs up to 50MB (Paste images directly)
          </p>
        </div>

        <input
          type="file"
          id="file-input-uploader"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            if (files && files.length > 0) {
              processFile(files[0]!)
            }
          }}
        />
        <label htmlFor="file-input-uploader">
          <Button variant="outline" size="sm" disabled={loading} className="cursor-pointer text-xs mt-1">
            Browse File
          </Button>
        </label>

        {errorMsg && (
          <div className="mt-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1.5 rounded-md flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-md flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>
    </div>
  )
}
