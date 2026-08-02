'use client'

import * as React from 'react'
import { History, Download, X, Upload, Loader2, GitCommit } from 'lucide-react'
import { documentsApi, DocumentDto, DocumentVersionDto } from '@/lib/api/documents-api'
import { Button } from '@/components/ui/button'

export interface VersionHistoryDialogProps {
  isOpen: boolean
  onClose: () => void
  document: DocumentDto | null
  onVersionAdded?: () => void
}

export function VersionHistoryDialog({
  isOpen,
  onClose,
  document,
  onVersionAdded,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = React.useState<DocumentVersionDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [changelog, setChangelog] = React.useState('')
  const [isUploading, setIsUploading] = React.useState(false)

  const loadVersions = React.useCallback(async () => {
    if (!document) return
    setLoading(true)
    try {
      const data = await documentsApi.getDocumentVersions(document.id)
      setVersions(data)
    } catch {
      setVersions([])
    } finally {
      setLoading(false)
    }
  }, [document])

  React.useEffect(() => {
    if (isOpen) {
      loadVersions()
    }
  }, [isOpen, loadVersions])

  if (!isOpen || !document) return null

  const handleUploadNewVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const result = evt.target?.result as string
        const base64Data = result.split(',')[1] || result

        await documentsApi.createVersion(document.id, {
          fileName: file.name,
          fileContent: base64Data,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          changelog: changelog.trim() || `Uploaded v${document.currentVersion + 1}`,
        })

        setChangelog('')
        await loadVersions()
        if (onVersionAdded) onVersionAdded()
      } catch {
        // ignore error
      } finally {
        setIsUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pt-10 px-4 animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Document Version History</h2>
              <p className="text-xs text-muted-foreground">{document.fileName} (v{document.currentVersion})</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Upload New Version Section */}
        <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-2">
          <label className="text-xs font-semibold text-foreground">Upload Replacement Version</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="Changelog notes (e.g. updated CAD dimensions)..."
              className="flex-1 px-3 py-1.5 bg-input border border-border rounded text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="file"
              id="new-version-file"
              className="hidden"
              onChange={handleUploadNewVersion}
            />
            <label htmlFor="new-version-file">
              <Button size="sm" disabled={isUploading} className="cursor-pointer text-xs">
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                Upload New Version
              </Button>
            </label>
          </div>
        </div>

        {/* Versions Timeline */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">Historical Versions</label>
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Loading versions...</span>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">No previous versions found.</div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="flex items-center justify-between p-3 bg-card border border-border rounded-lg text-xs hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <GitCommit className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">v{ver.versionNumber}</span>
                        <span className="text-[11px] text-muted-foreground">{ver.fileName}</span>
                      </div>
                      {ver.changelog && <p className="text-[11px] text-muted-foreground mt-0.5">{ver.changelog}</p>}
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(ver.createdAt).toLocaleString()} • {(ver.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>

                  <a href={ver.fileUrl} download={ver.fileName}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
