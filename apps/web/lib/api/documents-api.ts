import { apiClient } from "../api-client";

/** Documentation record returned by the API. */
export interface DocumentDto {
  id: string;
  entityType: string;
  entityId: string;
  documentType: string;
  sourceType: "UPLOADED_FILE" | "EXTERNAL_URL";
  title: string;
  description?: string | null;
  tags: string[];
  isConfidential: boolean;
  externalUrl?: string | null;
  externalUrlHost?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  currentVersion: number;
  uploadedById?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Authenticated API path for the stored file; null for external references. */
  downloadPath?: string | null;
  previewPath?: string | null;
}

export interface DocumentVersionDto {
  id: string;
  documentId: string;
  versionNumber: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  changelog?: string | null;
  uploadedById?: string | null;
  createdAt: string;
}

export interface UploadDocumentPayload {
  entityType: string;
  entityId: string;
  documentType: string;
  title?: string;
  description?: string;
  tags?: string[];
  isConfidential?: boolean;
  file: File;
}

export interface CreateExternalUrlPayload {
  entityType: string;
  entityId: string;
  documentType: string;
  title?: string;
  description?: string;
  url: string;
  tags?: string[];
  isConfidential?: boolean;
}

export interface UpdateDocumentMetadataPayload {
  title?: string;
  description?: string;
  documentType?: string;
  tags?: string[];
  isConfidential?: boolean;
  externalUrl?: string;
}

/**
 * Documentation API client.
 *
 * Uploads and revisions are multipart (`FormData`) — never base64 JSON — and
 * file bytes are fetched as Blobs through authenticated endpoints, because the
 * session token travels in the `Authorization` header and therefore cannot be
 * carried by a plain link or `<img src>`.
 */
export const documentsApi = {
  uploadDocument: (payload: UploadDocumentPayload): Promise<DocumentDto> => {
    const form = new FormData();
    form.append("entityType", payload.entityType);
    form.append("entityId", payload.entityId);
    form.append("documentType", payload.documentType);
    if (payload.title) form.append("title", payload.title);
    if (payload.description) form.append("description", payload.description);
    if (payload.tags && payload.tags.length > 0) {
      form.append("tags", JSON.stringify(payload.tags));
    }
    if (payload.isConfidential !== undefined) {
      form.append("isConfidential", String(payload.isConfidential));
    }
    form.append("file", payload.file);

    return apiClient.postFormData<DocumentDto>("/documents/upload", form);
  },

  createExternalUrl: (
    payload: CreateExternalUrlPayload,
  ): Promise<DocumentDto> => {
    return apiClient.post<DocumentDto, CreateExternalUrlPayload>(
      "/documents/external-url",
      payload,
    );
  },

  getEntityDocuments: (
    entityType: string,
    entityId: string,
  ): Promise<DocumentDto[]> => {
    return apiClient.get<DocumentDto[]>(
      `/documents/entity/${entityType}/${entityId}`,
    );
  },

  getDocument: (id: string): Promise<DocumentDto> => {
    return apiClient.get<DocumentDto>(`/documents/${id}`);
  },

  createVersion: (
    id: string,
    payload: { file: File; changelog?: string },
  ): Promise<DocumentDto> => {
    const form = new FormData();
    if (payload.changelog) form.append("changelog", payload.changelog);
    form.append("file", payload.file);

    return apiClient.postFormData<DocumentDto>(
      `/documents/${id}/version`,
      form,
    );
  },

  getDocumentVersions: (id: string): Promise<DocumentVersionDto[]> => {
    return apiClient.get<DocumentVersionDto[]>(`/documents/${id}/versions`);
  },

  /** Metadata updates use PATCH, matching the controller route. */
  updateMetadata: (
    id: string,
    payload: UpdateDocumentMetadataPayload,
  ): Promise<DocumentDto> => {
    return apiClient.patch<DocumentDto, UpdateDocumentMetadataPayload>(
      `/documents/${id}`,
      payload,
    );
  },

  deleteDocument: (id: string): Promise<{ success: boolean; id: string }> => {
    return apiClient.delete<{ success: boolean; id: string }>(
      `/documents/${id}`,
    );
  },

  /** Downloads the stored bytes (optionally a historical revision). */
  fetchDocumentBlob: (id: string, version?: number): Promise<Blob> => {
    const query = version === undefined ? "" : `?version=${version}`;
    return apiClient.getBlob(`/documents/${id}/download${query}`);
  },

  /** Fetches the same bytes for inline preview. */
  fetchPreviewBlob: (id: string, version?: number): Promise<Blob> => {
    const query = version === undefined ? "" : `?version=${version}`;
    return apiClient.getBlob(`/documents/${id}/preview${query}`);
  },
};

/**
 * Saves a Blob to disk under the given file name.
 *
 * The object URL is always revoked: the browser holds the file contents in
 * memory until it is released.
 */
export function saveBlobAsFile(blob: Blob, fileName: string): void {
  if (typeof window === "undefined") return;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

