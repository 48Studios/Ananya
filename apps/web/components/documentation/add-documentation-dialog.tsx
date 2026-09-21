"use client";

import * as React from "react";
import { ExternalLink, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { FileUploader } from "@/components/ui/file-uploader";
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
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_TYPE_OPTIONS,
  MAX_DOCUMENT_UPLOAD_BYTES,
  formatDocumentSize,
  parseTagInput,
  suggestDocumentTitle,
  suggestDocumentType,
  validateExternalUrlInput,
  type DocumentType,
} from "@/lib/component-documentation";

type AddMode = "UPLOAD" | "URL";

export interface AddDocumentationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: string;
  entityId: string;
  onCreated: (document: DocumentDto) => void;
}

/**
 * Adds documentation to an entity, either as an uploaded file or as an external
 * reference. The two modes are separate forms because they capture genuinely
 * different things: one stores bytes, the other stores a validated link. Neither
 * is created until the user submits, so a cancelled dialog leaves nothing behind.
 */
export function AddDocumentationDialog({
  isOpen,
  onClose,
  entityType,
  entityId,
  onCreated,
}: AddDocumentationDialogProps) {
  const [mode, setMode] = React.useState<AddMode>("UPLOAD");
  const [documentType, setDocumentType] =
    React.useState<DocumentType>(DEFAULT_DOCUMENT_TYPE);
  const [typeTouched, setTypeTouched] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [isConfidential, setIsConfidential] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setMode("UPLOAD");
    setDocumentType(DEFAULT_DOCUMENT_TYPE);
    setTypeTouched(false);
    setTitle("");
    setDescription("");
    setTags("");
    setIsConfidential(false);
    setFile(null);
    setUrl("");
    setError(null);
    setSubmitting(false);
  }, []);

  React.useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  /**
   * A chosen file pre-fills the title and suggests a document type. The type is
   * only suggested until the user picks one themselves, so a correction is never
   * overwritten.
   */
  const handleFileSelected = (selected: File) => {
    setFile(selected);
    setError(null);
    if (title.trim().length === 0) {
      setTitle(suggestDocumentTitle(selected.name));
    }
    if (!typeTouched) {
      setDocumentType(suggestDocumentType(selected.name, selected.type));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (mode === "UPLOAD" && !file) {
      setError("Choose a file to upload.");
      return;
    }

    let externalUrl: string | null = null;
    if (mode === "URL") {
      const check = validateExternalUrlInput(url);
      if (!check.ok) {
        setError(check.message);
        return;
      }
      externalUrl = check.url;
    }

    setSubmitting(true);
    try {
      const payloadTags = parseTagInput(tags);
      const created =
        mode === "UPLOAD" && file
          ? await documentsApi.uploadDocument({
              entityType,
              entityId,
              documentType,
              title: title.trim() || undefined,
              description: description.trim() || undefined,
              tags: payloadTags,
              isConfidential,
              file,
            })
          : await documentsApi.createExternalUrl({
              entityType,
              entityId,
              documentType,
              title: title.trim() || undefined,
              description: description.trim() || undefined,
              url: externalUrl!,
              tags: payloadTags,
              isConfidential,
            });

      onCreated(created);
      reset();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "The documentation entry could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hostPreview = validateExternalUrlInput(url);

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Add Documentation"
      description="Attach a datasheet, manual, CAD file, or a link to an external resource."
      size="md"
      closeDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogShellBody className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("UPLOAD");
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "UPLOAD"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="size-3.5" />
              Upload File
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("URL");
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === "URL"
                  ? "bg-card text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ExternalLink className="size-3.5" />
              External URL
            </button>
          </div>

          {mode === "UPLOAD" ? (
            <div className="space-y-2">
              <FileUploader
                accept={DOCUMENT_FILE_ACCEPT}
                maxSizeBytes={MAX_DOCUMENT_UPLOAD_BYTES}
                disabled={submitting}
                onFileSelected={handleFileSelected}
                title="Drag & drop a file, or click to browse"
                description={`Datasheets, manuals, images, archives, and CAD formats up to ${formatDocumentSize(MAX_DOCUMENT_UPLOAD_BYTES)}`}
              />
              {file ? (
                <p className="text-xs text-muted-foreground">
                  Selected:{" "}
                  <span className="font-medium text-foreground">
                    {file.name}
                  </span>{" "}
                  ({formatDocumentSize(file.size)})
                </p>
              ) : null}
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="documentation-url">URL</FieldLabel>
              <Input
                id="documentation-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.manufacturer.com/product/datasheet.pdf"
                disabled={submitting}
                autoComplete="off"
              />
              <FieldDescription>
                {hostPreview.ok
                  ? `Links to ${hostPreview.host}. Nothing is downloaded or mirrored — the link opens externally.`
                  : "Full https:// link to a manufacturer page, portal, or hosted file."}
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="documentation-type">Document Type</FieldLabel>
            <Select
              value={documentType}
              onValueChange={(value) => {
                setTypeTouched(true);
                setDocumentType((value as DocumentType) || DEFAULT_DOCUMENT_TYPE);
              }}
            >
              <SelectTrigger id="documentation-type" className="h-8 text-xs">
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
            <FieldDescription>
              Classifies what this resource is, so it can be found and filtered
              later.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="documentation-title">Title</FieldLabel>
            <Input
              id="documentation-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="RC0805FR Datasheet"
              disabled={submitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="documentation-description">
              Description
            </FieldLabel>
            <Textarea
              id="documentation-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional notes about this resource."
              disabled={submitting}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="documentation-tags">Tags</FieldLabel>
            <Input
              id="documentation-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="power, smd, verified"
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
            ) : mode === "UPLOAD" ? (
              "Upload"
            ) : (
              "Add Reference"
            )}
          </Button>
        </DialogShellFooter>
      </form>
    </DialogShell>
  );
}
