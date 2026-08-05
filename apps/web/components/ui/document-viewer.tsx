"use client";

import * as React from "react";
import { X, Download, Eye, FileCheck } from "lucide-react";
import { DocumentDto } from "@/lib/api/documents-api";
import { Button } from "@/components/ui/button";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pt-10 px-4 animate-in fade-in-0 duration-150">
      <div className="relative w-full max-w-4xl h-[85vh] bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 overflow-hidden">
            <Eye className="w-5 h-5 text-primary shrink-0" />
            <div className="truncate">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {document.title}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {document.fileName} • v{document.currentVersion} •{" "}
                {(document.sizeBytes / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={document.fileUrl}
              download={document.fileName}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm" className="text-xs">
                <Download className="w-3.5 h-3.5 mr-1" />
                Download
              </Button>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 overflow-auto bg-muted/40 p-4 flex items-center justify-center">
          {isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={document.fileUrl}
              alt={document.title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-md border border-border"
            />
          ) : isPdf ? (
            <iframe
              src={document.fileUrl}
              title={document.title}
              className="w-full h-full rounded-lg border border-border"
            />
          ) : isText ? (
            <div className="w-full h-full bg-card border border-border p-4 rounded-lg font-mono text-xs overflow-auto text-foreground">
              <p className="text-muted-foreground mb-2">{`// Text preview mode for ${document.fileName}`}</p>
              <pre className="whitespace-pre-wrap font-sans text-xs">
                Preview content ready for download.
              </pre>
            </div>
          ) : (
            <div className="text-center p-8 space-y-3">
              <FileCheck className="w-12 h-12 text-primary mx-auto opacity-70" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  CAD / Binary Document File
                </h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Direct inline rendering is unavailable for {document.mimeType}
                  . Click download to inspect in local desktop software.
                </p>
              </div>
              <a href={document.fileUrl} download={document.fileName}>
                <Button size="sm">
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download File ({document.fileName})
                </Button>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
