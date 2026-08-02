'use client'

import * as React from 'react'
import {
  Eye,
  Download,
  Trash2,
  History,
  Shield,
  Loader2,
  FileCheck,
} from 'lucide-react'
import { documentsApi, DocumentDto } from '@/lib/api/documents-api'
import { Button } from '@/components/ui/button'
import { FileUploader } from '@/components/ui/file-uploader'
import { DocumentViewer } from '@/components/ui/document-viewer'
import { VersionHistoryDialog } from '@/components/ui/version-history-dialog'

export interface AttachmentPanelProps {
  entityType: string
  entityId: string
}

export function AttachmentPanel({ entityType, entityId }: AttachmentPanelProps) {
  const [docList, setDocList] = React.useState<DocumentDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewDocument, setViewDocument] = React.useState<DocumentDto | null>(null)
  const [historyDocument, setHistoryDocument] = React.useState<DocumentDto | null>(null)

  const loadDocuments = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await documentsApi.getEntityDocuments(entityType, entityId)
      setDocList(data)
    } catch {
      setDocList([])
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  React.useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    try {
      await documentsApi.deleteDocument(id)
      await loadDocuments()
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* File Dropzone Uploader */}
      <FileUploader
        entityType={entityType}
        entityId={entityId}
        onUploadSuccess={loadDocuments}
      />

      {/* Attachment Records List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center justify-between">
          <span>Attached Documents ({docList.length})</span>
        </h3>

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading documents...</span>
          </div>
        ) : docList.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
            No document attachments found for this entity. Drag & drop files above to attach.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {docList.map((doc) => (
              <div
                key={doc.id}
                className="p-4 bg-card border border-border rounded-xl shadow-2xs hover:border-primary/40 transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileCheck className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <h4 className="text-xs font-semibold text-foreground truncate">{doc.title}</h4>
                      <p className="text-[11px] text-muted-foreground truncate">{doc.fileName}</p>
                    </div>
                  </div>

                  {doc.isConfidential && (
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded flex items-center gap-1 shrink-0">
                      <Shield className="w-3 h-3" />
                      Confidential
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2.5">
                  <span>v{doc.currentVersion} • {(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                  <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 border-t border-border pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewDocument(doc)}
                    className="h-7 px-2 text-xs"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Preview
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHistoryDocument(doc)}
                    className="h-7 px-2 text-xs"
                  >
                    <History className="w-3.5 h-3.5 mr-1" />
                    Versions
                  </Button>

                  <a href={doc.fileUrl} download={doc.fileName}>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  </a>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inline Previewer Modal */}
      <DocumentViewer
        isOpen={!!viewDocument}
        onClose={() => setViewDocument(null)}
        document={viewDocument}
      />

      {/* Version History Modal */}
      <VersionHistoryDialog
        isOpen={!!historyDocument}
        onClose={() => setHistoryDocument(null)}
        document={historyDocument}
        onVersionAdded={loadDocuments}
      />
    </div>
  )
}
