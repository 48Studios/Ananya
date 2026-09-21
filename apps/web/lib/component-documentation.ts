import type { DocumentDto, DocumentVersionDto } from "./api/documents-api";

/**
 * Component documentation presentation logic.
 *
 * Kept free of React and of the network so every rule the Documentation section
 * applies — type labels, source-kind handling, preview capability, list updates
 * after a mutation, and the endpoint safety checks the uploader/downloader rely
 * on — is unit testable in this workspace (there is no DOM testing library).
 *
 * The document type vocabulary mirrors `apps/api/src/documents/document-types.ts`;
 * `component-documentation.spec.ts` reads that file and fails if the two drift.
 */

export const DOCUMENT_TYPES = [
  "DATASHEET",
  "PRODUCT_PAGE",
  "APPLICATION_NOTE",
  "TECHNICAL_MANUAL",
  "REFERENCE_DESIGN",
  "CAD_DRAWING",
  "THREE_D_MODEL",
  "FOOTPRINT",
  "SYMBOL",
  "SAFETY_DOCUMENT",
  "CERTIFICATE",
  "COMPLIANCE_DOCUMENT",
  "TEST_REPORT",
  "INSTALLATION_GUIDE",
  "USER_MANUAL",
  "PHOTOGRAPH",
  "OTHER",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DATASHEET: "Datasheet",
  PRODUCT_PAGE: "Product Page",
  APPLICATION_NOTE: "Application Note",
  TECHNICAL_MANUAL: "Technical Manual",
  REFERENCE_DESIGN: "Reference Design",
  CAD_DRAWING: "CAD Drawing",
  THREE_D_MODEL: "3D Model",
  FOOTPRINT: "Footprint",
  SYMBOL: "Symbol",
  SAFETY_DOCUMENT: "Safety Document",
  CERTIFICATE: "Certificate",
  COMPLIANCE_DOCUMENT: "Compliance Document",
  TEST_REPORT: "Test Report",
  INSTALLATION_GUIDE: "Installation Guide",
  USER_MANUAL: "User Manual",
  PHOTOGRAPH: "Photograph",
  OTHER: "Other",
};

export const DEFAULT_DOCUMENT_TYPE: DocumentType = "OTHER";

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] =
  DOCUMENT_TYPES.map((value) => ({
    value,
    label: DOCUMENT_TYPE_LABELS[value],
  }));

export const DOCUMENT_SOURCE_TYPE_LABELS: Record<string, string> = {
  UPLOADED_FILE: "Uploaded file",
  EXTERNAL_URL: "External link",
};

export const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;

/** File picker filter, matching the formats the API accepts. */
export const DOCUMENT_FILE_ACCEPT =
  ".pdf,.txt,.csv,.md,.json,.xml,.yaml,.yml,.rtf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,image/*,.zip,.gz,.step,.stp,.iges,.igs,.stl,.obj,.3mf,.gltf,.glb,.wrl,.dwg,.dxf,.gbr,.sch,.brd,.nc";

export type DocumentPreviewKind = "IMAGE" | "PDF" | "TEXT" | "UNSUPPORTED";

/**
 * Image types browsers actually render inline.
 *
 * Deliberately a list rather than an `image/*` prefix test: DWG and DXF are
 * served as `image/vnd.dwg` / `image/vnd.dxf`, and TIFF has no browser decoder.
 * Treating those as previewable would hand them to an `<img>` that renders
 * nothing.
 */
const RENDERABLE_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "image/avif",
  "image/x-icon",
]);

/**
 * What the preview dialog can genuinely render.
 *
 * Engineering formats (STEP, STL, DWG, DXF, Gerber, ...) are deliberately
 * UNSUPPORTED: this app has no CAD renderer, and pretending otherwise would be
 * worse than offering the download.
 */
export function resolveDocumentPreviewKind(
  mimeType: string | null | undefined,
): DocumentPreviewKind {
  if (!mimeType) return "UNSUPPORTED";
  const mime = mimeType.split(";")[0]!.trim().toLowerCase();
  if (RENDERABLE_IMAGE_MIME_TYPES.has(mime)) return "IMAGE";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("text/") || mime === "application/json") return "TEXT";
  return "UNSUPPORTED";
}

/** True when the record is a link rather than a stored file. */
export function isExternalReference(
  document: Pick<DocumentDto, "sourceType">,
): boolean {
  return document.sourceType === "EXTERNAL_URL";
}

export function documentTypeLabel(value: unknown): string {
  const key = typeof value === "string" ? (value as DocumentType) : null;
  if (key && key in DOCUMENT_TYPE_LABELS) {
    return DOCUMENT_TYPE_LABELS[key];
  }
  return DOCUMENT_TYPE_LABELS.OTHER;
}

export function documentSourceLabel(
  document: Pick<DocumentDto, "sourceType">,
): string {
  return isExternalReference(document)
    ? DOCUMENT_SOURCE_TYPE_LABELS.EXTERNAL_URL!
    : DOCUMENT_SOURCE_TYPE_LABELS.UPLOADED_FILE!;
}

/** Host of an external reference, preferring the value the API resolved. */
export function externalReferenceHost(
  document: Pick<DocumentDto, "sourceType" | "externalUrl" | "externalUrlHost">,
): string | null {
  if (!isExternalReference(document)) return null;
  if (document.externalUrlHost) return document.externalUrlHost;
  if (!document.externalUrl) return null;
  try {
    return new URL(document.externalUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Human-readable size, or null when the record has no stored file. */
export function formatDocumentSize(
  sizeBytes: number | null | undefined,
): string | null {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes)) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Actions a documentation card may offer.
 *
 * File-specific actions are never offered for an external reference, whose only
 * meaningful action is opening the link.
 */
export type DocumentCardAction =
  | "PREVIEW"
  | "DOWNLOAD"
  | "OPEN"
  | "VERSIONS"
  | "EDIT"
  | "DELETE";

export function documentCardActions(
  document: Pick<DocumentDto, "sourceType">,
): DocumentCardAction[] {
  if (isExternalReference(document)) {
    return ["OPEN", "EDIT", "DELETE"];
  }
  return ["PREVIEW", "DOWNLOAD", "VERSIONS", "EDIT", "DELETE"];
}

/** Whether the current file can be previewed in-app. */
export function canPreviewDocument(
  document: Pick<DocumentDto, "sourceType" | "mimeType">,
): boolean {
  if (isExternalReference(document)) return false;
  return resolveDocumentPreviewKind(document.mimeType) !== "UNSUPPORTED";
}

export function unsupportedPreviewMessage(
  document: Pick<DocumentDto, "mimeType" | "fileName">,
): string {
  const kind = document.mimeType ?? "this file type";
  const name = document.fileName ? ` (${document.fileName})` : "";
  return `Inline preview is not available for ${kind}${name}. Download the file to open it in the appropriate desktop application.`;
}

// ---------------------------------------------------------------------------
// Add / edit defaults
// ---------------------------------------------------------------------------

/**
 * Suggests a document type from the file itself.
 *
 * Deliberately a deterministic mapping (extension, then MIME family) — Pass 1
 * performs no content analysis, and the user always confirms the value.
 */
export function suggestDocumentType(
  fileName: string,
  mimeType?: string | null,
): DocumentType {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9_]+)$/)?.[1] ?? "";
  const mime = (mimeType ?? "").split(";")[0]!.trim().toLowerCase();

  if (["step", "stp", "iges", "igs", "stl", "obj", "3mf", "gltf", "glb", "wrl"].includes(extension)) {
    return "THREE_D_MODEL";
  }
  if (["dwg", "dxf", "gbr", "gerber", "sch", "brd", "kicad_pcb", "kicad_sch"].includes(extension)) {
    return "CAD_DRAWING";
  }
  if (extension === "lib" || extension === "mod" || extension === "sym") {
    return "SYMBOL";
  }
  if (mime.startsWith("image/")) return "PHOTOGRAPH";
  if (mime === "application/pdf") return "DATASHEET";
  if (mime === "text/csv" || mime.includes("spreadsheet") || extension === "xlsx" || extension === "xls") {
    return "TEST_REPORT";
  }
  if (mime.startsWith("text/")) return "TECHNICAL_MANUAL";
  return DEFAULT_DOCUMENT_TYPE;
}

/** Title default: the file name without its extension. */
export function suggestDocumentTitle(fileName: string): string {
  const trimmed = fileName.trim();
  if (trimmed.length === 0) return "";
  const withoutExtension = trimmed.replace(/\.[a-z0-9_]{1,16}$/i, "");
  return withoutExtension.length > 0 ? withoutExtension : trimmed;
}

export interface ExternalUrlCheckSuccess {
  ok: true;
  url: string;
  host: string;
}

export interface ExternalUrlCheckFailure {
  ok: false;
  message: string;
}

export type ExternalUrlCheck = ExternalUrlCheckSuccess | ExternalUrlCheckFailure;

/**
 * Client-side mirror of the API's URL rules, so the form can fail fast with the
 * same wording. The server remains authoritative.
 */
export function validateExternalUrlInput(raw: string): ExternalUrlCheck {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "External URL is required." };
  }
  if (trimmed.length > 2048) {
    return {
      ok: false,
      message: "External URL must be 2048 characters or fewer.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message:
        "Enter a full URL including the scheme, for example https://example.com/datasheet.pdf.",
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      ok: false,
      message: `External URL must use http or https. Received "${parsed.protocol.replace(":", "")}".`,
    };
  }
  if (!parsed.hostname) {
    return { ok: false, message: "External URL must include a hostname." };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "External URL must not embed credentials.",
    };
  }

  return { ok: true, url: trimmed, host: parsed.hostname.toLowerCase() };
}

// ---------------------------------------------------------------------------
// List state (targeted updates instead of a refetch or a page reload)
// ---------------------------------------------------------------------------

/** Newest first, matching the API's ordering. */
export function sortDocumentation<T extends { createdAt: string }>(
  documents: T[],
): T[] {
  return [...documents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Adds a newly created record without refetching the list. */
export function applyDocumentCreated(
  documents: DocumentDto[],
  created: DocumentDto,
): DocumentDto[] {
  if (documents.some((document) => document.id === created.id)) {
    return documents;
  }
  return sortDocumentation([created, ...documents]);
}

/** Replaces a record after a metadata edit or a new version. */
export function applyDocumentUpdated(
  documents: DocumentDto[],
  updated: DocumentDto,
): DocumentDto[] {
  const next = documents.map((document) =>
    document.id === updated.id ? updated : document,
  );
  return next.some((document) => document.id === updated.id)
    ? sortDocumentation(next)
    : documents;
}

/** Removes a deleted record. */
export function applyDocumentRemoved(
  documents: DocumentDto[],
  removedId: string,
): DocumentDto[] {
  return documents.filter((document) => document.id !== removedId);
}

export function countDocumentationByType(
  documents: Pick<DocumentDto, "documentType">[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const document of documents) {
    const key = document.documentType ?? DEFAULT_DOCUMENT_TYPE;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Revision label shown on a card; external references have no revisions. */
export function documentVersionLabel(
  document: Pick<DocumentDto, "sourceType" | "currentVersion">,
): string | null {
  if (isExternalReference(document)) return null;
  return `v${document.currentVersion}`;
}

export function describeVersion(
  version: Pick<DocumentVersionDto, "versionNumber" | "sizeBytes">,
): string {
  const size = formatDocumentSize(version.sizeBytes);
  return size
    ? `v${version.versionNumber} • ${size}`
    : `v${version.versionNumber}`;
}

export const DOCUMENTATION_EMPTY_STATE = {
  title: "No documentation has been added to this component yet.",
  description:
    "Add datasheets, manuals, CAD files, application notes, product pages, and other technical resources.",
  actionLabel: "Add Documentation",
} as const;

/**
 * Parses the comma-separated tag input into the array the API expects.
 *
 * The server normalises and caps the list as well; this only keeps the payload
 * tidy and mirrors the same rules so the UI shows what will be stored.
 */
export function parseTagInput(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(",")) {
    const tag = part.trim().slice(0, 40);
    if (tag.length === 0) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 20) break;
  }
  return tags;
}

/** Inverse of {@link parseTagInput}, for pre-filling the edit form. */
export function formatTagInput(tags: string[] | null | undefined): string {
  return (tags ?? []).join(", ");
}
