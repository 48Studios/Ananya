"use client";

import * as React from "react";
import { Download, GitCommit, History, Loader2, Upload } from "lucide-react";
import {
  documentsApi,
  saveBlobAsFile,
  type DocumentDto,
  type DocumentVersionDto,
} from "@/lib/api/documents-api";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import {
  DOCUMENT_FILE_ACCEPT,
  MAX_DOCUMENT_UPLOAD_BYTES,
  describeVersion,
  formatDocumentDate,
  formatDocumentSize,
} from "@/lib/component-documentation";

export interface VersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDto | null;
  /** Called after a revision is uploaded, with the updated document. */
  onVersionAdded?: (document: DocumentDto) => void;
}

/**
 * Revision history for an uploaded file.
 *
 * Uploading a replacement creates a new revision, keeps the previous file, and
 * returns the updated document so the card can be updated in place. Individual
 * revisions stay downloadable, and deletion is never offered here — that is a
 * whole-document action.
 *
 * External references never reach this dialog: a URL has no bytes to version.
 */
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
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const documentId = document?.id ?? null;

  const loadVersions = React.useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const data = await documentsApi.getDocumentVersions(documentId);
      setVersions(data);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  React.useEffect(() => {
    if (isOpen && documentId) {
      setError(null);
      setChangelog("");
      loadVersions();
    }
  }, [isOpen, documentId, loadVersions]);

  if (!isOpen || !document) return null;

  const handleUploadNewVersion = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    // The picker keeps its selection between openings; clearing it here means
    // re-selecting the same file still fires a change event.
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      setError(
        `File exceeds the maximum upload size of ${formatDocumentSize(
          MAX_DOCUMENT_UPLOAD_BYTES,
        )}.`,
      );
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const updated = await documentsApi.createVersion(document.id, {
        file,
        changelog: changelog.trim() || undefined,
      });
      setChangelog("");
      await loadVersions();
      onVersionAdded?.(updated);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "The new version was not stored.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadVersion = async (version: DocumentVersionDto) => {
    setDownloadingId(version.id);
    setError(null);
    try {
      const blob = await documentsApi.fetchDocumentBlob(
        document.id,
        version.versionNumber,
      );
      saveBlobAsFile(blob, version.fileName);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "The version could not be loaded.",
      );
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title="Version History"
      description={`${document.fileName ?? document.title} currently tracks version ${document.currentVersion}. Previous revisions are kept and remain downloadable.`}
      size="sm"
      closeDisabled={isUploading}
    >
      <DialogShellBody className="space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <History className="size-5" />
          <span className="text-sm font-medium text-foreground">
            Historical versions and replacement uploads
          </span>
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <label
            className="text-xs font-semibold text-foreground"
            htmlFor="documentation-version-changelog"
          >
            Upload Replacement Version
          </label>
          <div className="flex gap-2">
            <input
              id="documentation-version-changelog"
              type="text"
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
              placeholder="Changelog notes (e.g. updated dimensions)…"
              disabled={isUploading}
              className="flex-1 rounded border border-border bg-input px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={DOCUMENT_FILE_ACCEPT}
              className="hidden"
              onChange={handleUploadNewVersion}
            />
            <Button
              size="sm"
              type="button"
              disabled={isUploading}
              className="cursor-pointer text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 size-3.5" />
              )}
              Upload New Version
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The current file stays available as the previous version.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <span className="text-xs font-semibold text-foreground">
            Historical Versions
          </span>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Loading versions…</span>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No previous versions found.
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-xs transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start gap-2.5">
                    <GitCommit className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">
                          v{version.versionNumber}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {version.fileName}
                        </span>
                      </div>
                      {version.changelog ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {version.changelog}
                        </p>
                      ) : null}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatDocumentDate(version.createdAt)} •{" "}
                        {describeVersion(version)}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={downloadingId === version.id}
                    onClick={() => handleDownloadVersion(version)}
                    title={`Download version ${version.versionNumber}`}
                  >
                    {downloadingId === version.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={isUploading}>
          Cancel
        </DialogShellCancelButton>
        <Button size="sm" onClick={onClose} disabled={isUploading}>
          Done
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
