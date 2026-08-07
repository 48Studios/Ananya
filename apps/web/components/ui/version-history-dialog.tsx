"use client";

import * as React from "react";
import { Download, GitCommit } from "lucide-react";
import {
  documentsApi,
  DocumentDto,
  DocumentVersionDto,
} from "@/lib/api/documents-api";
import { Button } from "@/components/ui/button";
import { FileUploader } from "@/components/ui/file-uploader";
import { DialogShell } from "@/components/ui/dialog-shell";

export interface VersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDto | null;
  onVersionAdded?: () => void;
}

export function VersionHistoryDialog({
  isOpen,
  onClose,
  document,
  onVersionAdded,
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = React.useState<DocumentVersionDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [changelog, setChangelog] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);

  const loadVersions = React.useCallback(async () => {
    if (!document) return;
    setLoading(true);
    try {
      const data = await documentsApi.getDocumentVersions(document.id);
      setVersions(data);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [document]);

  React.useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, loadVersions]);

  const handleFileSelected = async (file: File) => {
    if (!document) return;
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const result = evt.target?.result as string;
        const base64Data = result.split(",")[1] || result;

        await documentsApi.createVersion(document.id, {
          fileName: file.name,
          fileContent: base64Data,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          changelog: changelog.trim() || undefined,
        });

        setChangelog("");
        await loadVersions();
        if (onVersionAdded) onVersionAdded();
      } catch {
        // ignore
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <DialogShell
      open={isOpen && Boolean(document)}
      onOpenChange={(open) => {
        if (!open && !isUploading) {
          onClose();
        }
      }}
      title="Document Version History"
      description={
        document
          ? `${document.title} (${document.fileName})`
          : "View and manage document revisions."
      }
      size="xl"
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Upload Replacement Version */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">
            Upload Replacement Version
          </label>
          <input
            type="text"
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="Changelog notes (e.g. updated CAD dimensions)..."
            className="w-full px-3 py-1.5 bg-input border border-border rounded text-xs text-foreground outline-none focus:ring-1 focus:ring-primary mb-2"
          />
          <FileUploader
            loading={isUploading}
            onFileSelected={handleFileSelected}
            title="Upload new version"
            description="Drag & drop new file or click to browse"
          />
        </div>

        {/* Versions Timeline */}
        <div className="space-y-2 pt-2">
          <label className="text-xs font-semibold text-foreground">
            Historical Versions
          </label>
          {loading ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No previous versions found.
            </div>
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
                        <span className="font-bold text-foreground">
                          v{ver.versionNumber}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {ver.fileName}
                        </span>
                      </div>
                      {ver.changelog && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {ver.changelog}
                        </p>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(ver.createdAt).toLocaleString()} •{" "}
                        {(ver.sizeBytes / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>

                  <a href={ver.fileUrl} download={ver.fileName}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DialogShell>
  );
}

