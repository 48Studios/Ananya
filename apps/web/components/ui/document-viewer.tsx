"use client";

import * as React from "react";
import { Download, FileWarning, Loader2 } from "lucide-react";
import {
  documentsApi,
  saveBlobAsFile,
  type DocumentDto,
} from "@/lib/api/documents-api";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import {
  formatDocumentSize,
  isExternalReference,
  resolveDocumentPreviewKind,
  unsupportedPreviewMessage,
} from "@/lib/component-documentation";

export interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDto | null;
}

/**
 * Inline document preview.
 *
 * Document bytes live behind an authenticated endpoint, so they are fetched as
 * a Blob and rendered from an object URL — a bare `<img src="/documents/…">` or
 * `<iframe src>` cannot carry the session token. Formats this application cannot
 * render (STEP, STL, DWG, DXF, Gerber, ...) are reported as unsupported with a
 * download action rather than being handed to a renderer that would fail.
 */
export function DocumentViewer({
  isOpen,
  onClose,
  document,
}: DocumentViewerProps) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [textContent, setTextContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const previewKind = document
    ? resolveDocumentPreviewKind(document.mimeType)
    : "UNSUPPORTED";

  React.useEffect(() => {
    if (!isOpen || !document || isExternalReference(document)) return;
    if (previewKind === "UNSUPPORTED") return;

    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setTextContent(null);

    documentsApi
      .fetchPreviewBlob(document.id)
      .then(async (blob) => {
        if (cancelled) return;
        if (previewKind === "TEXT") {
          const text = await blob.text();
          if (cancelled) return;
          setTextContent(text);
          return;
        }
        createdUrl = window.URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "The preview could not be loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) window.URL.revokeObjectURL(createdUrl);
      setObjectUrl(null);
    };
  }, [isOpen, document, previewKind]);

  if (!isOpen || !document) return null;

  const sizeLabel = formatDocumentSize(document.sizeBytes);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const blob = await documentsApi.fetchDocumentBlob(document.id);
      saveBlobAsFile(blob, document.fileName ?? document.title);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "The file could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={document.title}
      description={[
        document.fileName,
        `v${document.currentVersion}`,
        sizeLabel,
      ]
        .filter(Boolean)
        .join(" • ")}
      size="lg"
      contentClassName="h-[min(85vh,calc(100dvh-2rem))]"
    >
      <DialogShellBody className="flex items-center justify-center bg-muted/40">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            Loading preview…
          </div>
        ) : error ? (
          <div className="max-w-sm space-y-2 p-8 text-center">
            <FileWarning className="mx-auto size-10 text-destructive opacity-80" />
            <p className="text-sm font-medium text-foreground">
              Preview unavailable
            </p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : previewKind === "IMAGE" && objectUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={objectUrl}
            alt={document.title}
            className="max-h-full max-w-full rounded-lg border border-border object-contain shadow-md"
          />
        ) : previewKind === "PDF" && objectUrl ? (
          <iframe
            src={objectUrl}
            title={document.title}
            className="h-full w-full rounded-lg border border-border"
          />
        ) : previewKind === "TEXT" && textContent !== null ? (
          <div className="h-full w-full overflow-auto rounded-lg border border-border bg-card p-4">
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground">
              {textContent}
            </pre>
          </div>
        ) : (
          <div className="max-w-md space-y-3 p-8 text-center">
            <FileWarning className="mx-auto size-12 text-primary opacity-70" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Preview not supported
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {unsupportedPreviewMessage(document)}
              </p>
            </div>
          </div>
        )}
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton />
        <Button size="sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 size-3.5" />
          )}
          Download
        </Button>
      </DialogShellFooter>
    </DialogShell>
  );
}
