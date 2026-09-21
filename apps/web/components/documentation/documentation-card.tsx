"use client";

import * as React from "react";
import {
  Box,
  Download,
  ExternalLink,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Ruler,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocumentDto } from "@/lib/api/documents-api";
import type { DocumentAnalysisStateDto } from "@/lib/api/documentation-intelligence-api";
import {
  canPreviewDocument,
  documentSourceLabel,
  documentTypeLabel,
  documentVersionLabel,
  externalReferenceHost,
  formatDocumentDate,
  formatDocumentSize,
  isExternalReference,
} from "@/lib/component-documentation";
import {
  analysisStatusLabel,
  deriveAnalyzeAction,
  describeAnalysisStatus,
} from "@/lib/document-intelligence";

export interface DocumentationCardProps {
  document: DocumentDto;
  onPreview: (document: DocumentDto) => void;
  onDownload: (document: DocumentDto) => void;
  onVersions: (document: DocumentDto) => void;
  onEdit: (document: DocumentDto) => void;
  onDelete: (document: DocumentDto) => void;
  onAnalyze?: (document: DocumentDto) => void;
  /** Analysis state for this document, when it has been fetched. */
  analysisState?: DocumentAnalysisStateDto | null;
  /** Whether the user may run analysis (component-write permission). */
  canWrite?: boolean;
  busy?: boolean;
}

function DocumentTypeIcon({ type }: { type: string }) {
  const className = "size-4";
  if (type === "PHOTOGRAPH") return <ImageIcon className={className} />;
  if (type === "THREE_D_MODEL") return <Box className={className} />;
  if (type === "CAD_DRAWING" || type === "FOOTPRINT" || type === "SYMBOL") {
    return <Ruler className={className} />;
  }
  return <FileText className={className} />;
}

/**
 * Footer action buttons are one equal-width cell each, so the row fills the
 * card instead of clustering against its right edge.
 */
const FOOTER_ACTION_CLASS = "h-7 w-full min-w-0 px-1 text-xs";

/**
 * The footer is its own container: when it is too narrow for five labelled
 * cells, the label is dropped visually but stays in the accessibility tree,
 * so the action is still announced by name.
 */
const FOOTER_ACTION_LABEL_CLASS = "sr-only @md/doc-actions:not-sr-only";

/**
 * One documentation record.
 *
 * The card states what the record actually is — document type and whether it is
 * a stored file or an external link — and offers only the actions that make
 * sense for it. A link is never given "Download"/"Version history", because
 * there is no object on this server to download or version.
 */
export function DocumentationCard({
  document,
  onPreview,
  onDownload,
  onVersions,
  onEdit,
  onDelete,
  onAnalyze,
  analysisState = null,
  canWrite = false,
  busy = false,
}: DocumentationCardProps) {
  const external = isExternalReference(document);
  const host = externalReferenceHost(document);
  const size = formatDocumentSize(document.sizeBytes);

  // Documentation Intelligence is offered only where the API will accept it.
  const analyzeAction = deriveAnalyzeAction({
    document,
    eligibility: analysisState?.eligibility ?? null,
    analyzing: analysisState?.inProgress ?? false,
    canWrite,
  });
  const analysis = analysisState?.analysis ?? null;
  const supersededAnalysis = analysisState?.latestAnalysis ?? null;
  const versionLabel = documentVersionLabel(document);
  const tags = document.tags ?? [];

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {external ? (
              <ExternalLink className="size-4" />
            ) : (
              <DocumentTypeIcon type={document.documentType} />
            )}
          </div>
          <div className="min-w-0">
            <h4
              className="truncate text-sm font-semibold text-foreground"
              title={document.title}
            >
              {document.title}
            </h4>
            {document.description ? (
              <p
                className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                title={document.description}
              >
                {document.description}
              </p>
            ) : null}
          </div>
        </div>

        {document.isConfidential ? (
          <span className="flex shrink-0 items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            <Shield className="size-3" />
            Confidential
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
          {documentTypeLabel(document.documentType)}
        </span>
        <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {documentSourceLabel(document)}
        </span>
        {!external && versionLabel ? (
          <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {versionLabel}
          </span>
        ) : null}
        {!external && size ? (
          <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {size}
          </span>
        ) : null}
        <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
          Updated {formatDocumentDate(document.updatedAt)}
        </span>
      </div>

      {external && host ? (
        <p
          className="truncate font-mono text-[11px] text-muted-foreground"
          title={document.externalUrl ?? ""}
        >
          {host}
        </p>
      ) : null}

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {tags.length > 6 ? (
            <span className="text-[10px] text-muted-foreground">
              +{tags.length - 6} more
            </span>
          ) : null}
        </div>
      ) : null}

      {/*
       * AI analysis for eligible datasheets. Contextual to this document:
       * status plus the counts the analysis actually reported. Suggestions are
       * reviewed in the existing Component Review Queue, never here.
       */}
      {analysis || analyzeAction.visible ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Sparkles className="size-3.5 text-primary" />
              AI Analysis
            </span>
            {analysis ? (
              <span
                className={`font-mono text-[10px] ${
                  analysis.status === "ANALYSIS_FAILED"
                    ? "text-destructive"
                    : !analysis.isCurrent
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                }`}
              >
                {analysis.status === "ANALYSIS_FAILED" ? "FAILED" : "✓"}{" "}
                {analysisStatusLabel(analysis.status)}
              </span>
            ) : null}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {analysis
              ? describeAnalysisStatus(analysis)
              : (analyzeAction.reason ??
                "Extract manufacturer, part number, and specifications as review suggestions.")}
          </p>

          {analysis && analysis.status !== "ANALYSIS_FAILED" ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5">
              {analysis.identity.manufacturerName ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[10px] text-muted-foreground">
                    Manufacturer
                  </dt>
                  <dd className="truncate font-mono text-[10px] text-foreground">
                    {analysis.identity.manufacturerName}
                  </dd>
                </div>
              ) : null}
              {analysis.identity.manufacturerPartNumber ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[10px] text-muted-foreground">MPN</dt>
                  <dd className="truncate font-mono text-[10px] text-foreground">
                    {analysis.identity.manufacturerPartNumber}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-[10px] text-muted-foreground">
                  Specifications
                </dt>
                <dd className="font-mono text-[10px] text-foreground">
                  {analysis.summary.extractedSpecifications}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[10px] text-muted-foreground">
                  Unresolved
                </dt>
                <dd className="font-mono text-[10px] text-foreground">
                  {analysis.summary.unresolvedDefinitions +
                    analysis.summary.unresolvedValues}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[10px] text-muted-foreground">Evidence</dt>
                <dd className="font-mono text-[10px] text-foreground">
                  {analysis.summary.evidenceCount}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[10px] text-muted-foreground">
                  Suggestions
                </dt>
                <dd className="font-mono text-[10px] text-foreground">
                  {analysis.summary.findingsPending}
                </dd>
              </div>
            </dl>
          ) : null}

          {!analysis && supersededAnalysis ? (
            <p className="text-[10px] text-muted-foreground">
              Version {supersededAnalysis.document.documentVersion} was analyzed
              on {formatDocumentDate(supersededAnalysis.analyzedAt)}.
            </p>
          ) : null}

          {onAnalyze ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full gap-1.5 text-[11px]"
              disabled={!analyzeAction.enabled}
              title={analyzeAction.reason ?? "Analyze this datasheet"}
              onClick={() => onAnalyze(document)}
            >
              {analysisState?.inProgress ? (
                <>
                  <Loader2 className="size-3 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="size-3" />
                  {analysis ? "View AI Analysis" : "Analyze with AI"}
                </>
              )}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/*
       * Footer actions: one equal-width cell per action. External references
       * offer three actions, stored files five.
       */}
      <div
        className={`@container/doc-actions grid gap-1 border-t border-border pt-3 ${
          external ? "grid-cols-3" : "grid-cols-5"
        }`}
      >
        {external ? (
          <a
            href={document.externalUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0"
          >
            <Button variant="ghost" size="sm" className={FOOTER_ACTION_CLASS}>
              <ExternalLink className="size-3.5" />
              <span className={FOOTER_ACTION_LABEL_CLASS}>Open</span>
            </Button>
          </a>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className={FOOTER_ACTION_CLASS}
              disabled={busy || !canPreviewDocument(document)}
              title={
                canPreviewDocument(document)
                  ? "Preview this document"
                  : "Inline preview is not available for this format"
              }
              onClick={() => onPreview(document)}
            >
              <Eye className="size-3.5" />
              <span className={FOOTER_ACTION_LABEL_CLASS}>Preview</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={FOOTER_ACTION_CLASS}
              disabled={busy}
              onClick={() => onDownload(document)}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              <span className={FOOTER_ACTION_LABEL_CLASS}>Download</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={FOOTER_ACTION_CLASS}
              disabled={busy}
              onClick={() => onVersions(document)}
            >
              <History className="size-3.5" />
              <span className={FOOTER_ACTION_LABEL_CLASS}>Versions</span>
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className={FOOTER_ACTION_CLASS}
          disabled={busy}
          onClick={() => onEdit(document)}
        >
          <Pencil className="size-3.5" />
          <span className={FOOTER_ACTION_LABEL_CLASS}>Edit</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${FOOTER_ACTION_CLASS} text-destructive hover:text-destructive`}
          disabled={busy}
          onClick={() => onDelete(document)}
        >
          <Trash2 className="size-3.5" />
          <span className={FOOTER_ACTION_LABEL_CLASS}>Delete</span>
        </Button>
      </div>
    </div>
  );
}
