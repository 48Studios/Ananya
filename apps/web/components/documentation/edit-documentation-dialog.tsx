"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { documentsApi, type DocumentDto } from "@/lib/api/documents-api";
import {
  DOCUMENT_TYPE_OPTIONS,
  formatTagInput,
  isExternalReference,
  parseTagInput,
  validateExternalUrlInput,
  type DocumentType,
} from "@/lib/component-documentation";

export interface EditDocumentationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDto | null;
  onUpdated: (document: DocumentDto) => void;
}

/**
 * Edits documentation metadata.
 *
 * The source kind is fixed: an uploaded file cannot become a link (or the other
 * way round) because that would silently discard the stored object or fabricate
 * one. Only the link target itself is editable for external references.
 */
export function EditDocumentationDialog({
  isOpen,
  onClose,
  document,
  onUpdated,
}: EditDocumentationDialogProps) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [documentType, setDocumentType] = React.useState<DocumentType>("OTHER");
  const [tags, setTags] = React.useState("");
  const [isConfidential, setIsConfidential] = React.useState(false);
  const [externalUrl, setExternalUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen || !document) return;
    setTitle(document.title);
    setDescription(document.description ?? "");
    setDocumentType(document.documentType as DocumentType);
    setTags(formatTagInput(document.tags));
    setIsConfidential(document.isConfidential);
    setExternalUrl(document.externalUrl ?? "");
    setError(null);
    setSubmitting(false);
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const external = isExternalReference(document);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (title.trim().length === 0) {
      setError("Title cannot be empty.");
      return;
    }

    let url: string | undefined;
    if (external) {
      const check = validateExternalUrlInput(externalUrl);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      url = check.url;
    }

    setSubmitting(true);
    try {
      const updated = await documentsApi.updateMetadata(document.id, {
        title: title.trim(),
        description: description.trim(),
        documentType,
        tags: parseTagInput(tags),
        isConfidential,
        ...(url ? { externalUrl: url } : {}),
      });
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "The documentation entry could not be updated.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Edit Documentation"
      description={
        external
          ? "Update the metadata or destination of this external reference."
          : "Update how this file is described. The file itself is replaced by uploading a new version."
      }
      size="md"
      closeDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogShellBody className="space-y-5">
          {external ? (
            <Field>
              <FieldLabel htmlFor="edit-documentation-url">URL</FieldLabel>
              <Input
                id="edit-documentation-url"
                value={externalUrl}
                onChange={(event) => setExternalUrl(event.target.value)}
                disabled={submitting}
                autoComplete="off"
              />
              <FieldDescription>
                The link opens externally. Ananya never downloads or mirrors it.
              </FieldDescription>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="edit-documentation-type">
              Document Type
            </FieldLabel>
            <Select
              value={documentType}
              onValueChange={(value) =>
                setDocumentType((value as DocumentType) || "OTHER")
              }
            >
              <SelectTrigger id="edit-documentation-type" className="h-8 text-xs">
                <SelectValue placeholder="Select a document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-documentation-title">Title</FieldLabel>
            <Input
              id="edit-documentation-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-documentation-description">
              Description
            </FieldLabel>
            <Textarea
              id="edit-documentation-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="edit-documentation-tags">Tags</FieldLabel>
            <Input
              id="edit-documentation-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              disabled={submitting}
            />
            <FieldDescription>Comma separated, up to 20 tags.</FieldDescription>
          </Field>

          <label className="flex items-center gap-2 text-xs text-foreground">
            <Checkbox
              checked={isConfidential}
              onCheckedChange={(checked) => setIsConfidential(checked === true)}
              disabled={submitting}
            />
            Mark as confidential
          </label>

          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton disabled={submitting} />
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
