"use client";

import * as React from "react";
import { FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { DocumentViewer } from "@/components/ui/document-viewer";
import { VersionHistoryDialog } from "@/components/ui/version-history-dialog";
import { AddDocumentationDialog } from "@/components/documentation/add-documentation-dialog";
import { DocumentAnalysisDialog } from "@/components/documentation/document-analysis-dialog";
import { DocumentationCard } from "@/components/documentation/documentation-card";
import { EditDocumentationDialog } from "@/components/documentation/edit-documentation-dialog";
import { ComponentReviewQueueDialog } from "@/components/components/component-review-queue-dialog";
import {
  documentsApi,
  saveBlobAsFile,
  type DocumentDto,
} from "@/lib/api/documents-api";
import {
  documentationIntelligenceApi,
  type DocumentAnalysisStateDto,
} from "@/lib/api/documentation-intelligence-api";
import {
  DOCUMENTATION_EMPTY_STATE,
  applyDocumentCreated,
  applyDocumentRemoved,
  applyDocumentUpdated,
  isExternalReference,
} from "@/lib/component-documentation";
import {
  applyAnalysisState,
  COMPONENT_WRITE_PERMISSION,
  type AnalysisStateMap,
} from "@/lib/document-intelligence";
import { useAuth } from "@/lib/auth/auth-context";

export interface DocumentationPanelProps {
  entityType: string;
  entityId: string;
  /**
   * Extra header actions, rendered before "Add Documentation".
   *
   * The panel stays entity-agnostic: a host that has its own documentation
   * workflow (component specification intelligence, for example) passes the
   * entry point in rather than the panel learning about that workflow.
   */
  headerActions?: React.ReactNode;
}

/**
 * Documentation section for an entity (components in Pass 1).
 *
 * The section owns its list and updates it from the response of each mutation
 * (`applyDocumentCreated` / `applyDocumentUpdated` / `applyDocumentRemoved`)
 * rather than refetching the page or requiring a browser refresh. Uploads,
 * edits, revisions and deletions are all reflected immediately.
 *
 * Pass 2 adds document intelligence: eligible datasheets expose "Analyze with
 * AI", the analysis state is cached per document and merged from each response,
 * and the existing Component Review Queue dialog is opened for review rather
 * than a second review surface being built.
 */
export function DocumentationPanel({
  entityType,
  entityId,
  headerActions,
}: DocumentationPanelProps) {
  const [documents, setDocuments] = React.useState<DocumentDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [analyses, setAnalyses] = React.useState<AnalysisStateMap>({});

  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentDto | null>(null);
  const [versioning, setVersioning] = React.useState<DocumentDto | null>(null);
  const [previewing, setPreviewing] = React.useState<DocumentDto | null>(null);
  const [analyzing, setAnalyzing] = React.useState<DocumentDto | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<DocumentDto | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [isReviewQueueOpen, setIsReviewQueueOpen] = React.useState(false);

  const { hasPermission } = useAuth();
  const canWrite = hasPermission(COMPONENT_WRITE_PERMISSION);

  const load = React.useCallback(async () => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await documentsApi.getEntityDocuments(entityType, entityId);
      setDocuments(list);

      // Fetch analysis state for the datasheets only: other document types
      // cannot be analyzed, so the panel does not query them.
      const datasheets = list.filter(
        (document) =>
          document.documentType === "DATASHEET" &&
          document.sourceType === "UPLOADED_FILE",
      );
      const states = await Promise.all(
        datasheets.map(async (document) => {
          try {
            const state = await documentationIntelligenceApi.getAnalysis(
              document.id,
            );
            return [document.id, state] as [string, DocumentAnalysisStateDto];
          } catch {
            return null;
          }
        }),
      );

      setAnalyses((current) => {
        let next = current;
        for (const entry of states) {
          if (!entry) continue;
          next = applyAnalysisState(next, entry[0], entry[1]);
        }
        return next;
      });
    } catch (error: unknown) {
      setDocuments([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Documentation could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleCreated = (created: DocumentDto) => {
    setDocuments((current) => applyDocumentCreated(current, created));
    setActionError(null);
  };

  const handleUpdated = (updated: DocumentDto) => {
    setDocuments((current) => applyDocumentUpdated(current, updated));
    setActionError(null);
  };

  const handleDownload = async (document: DocumentDto) => {
    if (isExternalReference(document)) return;
    setBusyId(document.id);
    setActionError(null);
    try {
      const blob = await documentsApi.fetchDocumentBlob(document.id);
      saveBlobAsFile(blob, document.fileName ?? document.title);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The file could not be downloaded.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteLoading(true);
    setActionError(null);
    try {
      await documentsApi.deleteDocument(pendingDelete.id);
      const removedId = pendingDelete.id;
      setDocuments((current) => applyDocumentRemoved(current, removedId));
      setPendingDelete(null);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The documentation entry could not be deleted.",
      );
      setPendingDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <SectionCard
      title="Documentation"
      description="Datasheets, manuals, drawings, and links to external resources for this component."
      icon={FileText}
      contentClassName="space-y-4"
      actions={
        <>
          {headerActions}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus className="size-3.5 text-primary" />
            Add Documentation
          </Button>
        </>
      }
    >
      {actionError ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Loading documentation…</span>
        </div>
      ) : loadError ? (
        <div className="space-y-2 py-6 text-center">
          <p className="text-xs text-destructive">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          compact
          title={DOCUMENTATION_EMPTY_STATE.title}
          description={DOCUMENTATION_EMPTY_STATE.description}
          icon={FileText}
          action={{
            label: DOCUMENTATION_EMPTY_STATE.actionLabel,
            onClick: () => setIsAddOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {documents.map((document) => (
            <DocumentationCard
              key={document.id}
              document={document}
              busy={busyId === document.id}
              analysisState={analyses[document.id] ?? null}
              canWrite={canWrite}
              onPreview={setPreviewing}
              onDownload={handleDownload}
              onVersions={setVersioning}
              onEdit={setEditing}
              onDelete={setPendingDelete}
              onAnalyze={setAnalyzing}
            />
          ))}
        </div>
      )}

      <AddDocumentationDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        entityType={entityType}
        entityId={entityId}
        onCreated={handleCreated}
      />

      <EditDocumentationDialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        document={editing}
        onUpdated={handleUpdated}
      />

      <VersionHistoryDialog
        isOpen={versioning !== null}
        onClose={() => setVersioning(null)}
        document={versioning}
        onVersionAdded={handleUpdated}
      />

      <DocumentViewer
        isOpen={previewing !== null}
        onClose={() => setPreviewing(null)}
        document={previewing}
      />

      <DocumentAnalysisDialog
        isOpen={analyzing !== null}
        onClose={() => setAnalyzing(null)}
        document={analyzing}
        canWrite={canWrite}
        onReviewSuggestions={() => setIsReviewQueueOpen(true)}
      />

      {/*
       * The existing Component Review Queue dialog, opened from the analysis.
       * Documentation Intelligence deliberately has no review surface of its
       * own: document-derived findings are reviewed and applied exactly like
       * every other component finding.
       */}
      <ComponentReviewQueueDialog
        isOpen={isReviewQueueOpen}
        onClose={() => setIsReviewQueueOpen(false)}
        onActionComplete={load}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete Documentation"
        description={`Delete "${pendingDelete?.title ?? ""}"? ${
          pendingDelete && isExternalReference(pendingDelete)
            ? "The external reference will be removed."
            : "The stored file and all of its versions will be removed."
        } This cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SectionCard>
  );
}
