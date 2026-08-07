"use client";

import * as React from "react";
import { Download, FileCheck } from "lucide-react";
import { DocumentDto } from "@/lib/api/documents-api";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";

export interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDto | null;
}

export function DocumentViewer({
  isOpen,
  onClose,
  document,
}: DocumentViewerProps) {
  if (!isOpen || !document) return null;

  const isImage = document.mimeType.startsWith("image/");
  const isPdf = document.mimeType === "application/pdf";
  const isText =
    document.mimeType.startsWith("text/") ||
    document.mimeType === "application/json";

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={document.title}
      description={`${document.fileName} • v${document.currentVersion} • ${(document.sizeBytes / 1024).toFixed(1)} KB`}
      size="lg"
      contentClassName="h-[min(85vh,calc(100dvh-2rem))]"
    >
      <DialogShellBody className="flex items-center justify-center bg-muted/40">
        {isImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={document.fileUrl}
            alt={document.title}
            className="max-h-full max-w-full rounded-lg border border-border object-contain shadow-md"
          />
        ) : isPdf ? (
          <iframe
            src={document.fileUrl}
            title={document.title}
            className="h-full w-full rounded-lg border border-border"
          />
        ) : isText ? (
          <div className="h-full w-full overflow-auto rounded-lg border border-border bg-card p-4 font-mono text-xs text-foreground">
            <p className="mb-2 text-muted-foreground">{`// Text preview mode for ${document.fileName}`}</p>
            <pre className="whitespace-pre-wrap font-sans text-xs">
              Preview content ready for download.
            </pre>
          </div>
        ) : (
          <div className="space-y-3 p-8 text-center">
            <FileCheck className="mx-auto h-12 w-12 text-primary opacity-70" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                CAD / Binary Document File
              </h4>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Direct inline rendering is unavailable for {document.mimeType}.
                Click download to inspect in local desktop software.
              </p>
            </div>
            <a href={document.fileUrl} download={document.fileName}>
              <Button size="sm">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download File ({document.fileName})
              </Button>
            </a>
          </div>
        )}
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton />
        <a
          href={document.fileUrl}
          download={document.fileName}
          target="_blank"
          rel="noreferrer"
        >
          <Button size="sm">
            <Download className="mr-1.5 size-3.5" />
            Download
          </Button>
        </a>
      </DialogShellFooter>
    </DialogShell>
  );
}
