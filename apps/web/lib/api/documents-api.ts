import { apiClient } from '../api-client';

export interface DocumentDto {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  description?: string | null;
  fileName: string;
  fileUrl: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  currentVersion: number;
  tags?: string[] | null;
  isConfidential: boolean;
  uploadedById?: string | null;
  createdAt: string;
  updatedAt: string;
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

export const documentsApi = {
  uploadDocument: (params: {
    entityType: string;
    entityId: string;
    title: string;
    description?: string;
    fileName: string;
    fileContent: string;
    mimeType: string;
    sizeBytes: number;
    tags?: string[];
    isConfidential?: boolean;
  }): Promise<DocumentDto> => {
    return apiClient.post<DocumentDto>('/documents/upload', params);
  },

  getEntityDocuments: (entityType: string, entityId: string): Promise<DocumentDto[]> => {
    return apiClient.get<DocumentDto[]>(`/documents/entity/${entityType}/${entityId}`);
  },

  getDocument: (id: string): Promise<DocumentDto> => {
    return apiClient.get<DocumentDto>(`/documents/${id}`);
  },

  createVersion: (
    id: string,
    params: {
      fileName: string;
      fileContent: string;
      mimeType: string;
      sizeBytes: number;
      changelog?: string;
    },
  ): Promise<DocumentDto> => {
    return apiClient.post<DocumentDto>(`/documents/${id}/version`, params);
  },

  getDocumentVersions: (id: string): Promise<DocumentVersionDto[]> => {
    return apiClient.get<DocumentVersionDto[]>(`/documents/${id}/versions`);
  },

  updateMetadata: (
    id: string,
    params: {
      title?: string;
      description?: string;
      tags?: string[];
      isConfidential?: boolean;
    },
  ): Promise<DocumentDto> => {
    return apiClient.post<DocumentDto>(`/documents/${id}`, params);
  },

  deleteDocument: (id: string): Promise<{ success: boolean; id: string }> => {
    return apiClient.delete<{ success: boolean; id: string }>(`/documents/${id}`);
  },
};
