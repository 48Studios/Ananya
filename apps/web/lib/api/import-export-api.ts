import { apiClient } from "../api-client";

export type ExportFormat = "CSV" | "EXCEL" | "JSON";
export type BulkActionType =
  | "DELETE"
  | "ARCHIVE"
  | "UPDATE_STATUS"
  | "ASSIGN_CATEGORY"
  | "ASSIGN_LOCATION"
  | "ASSIGN_MANUFACTURER";

export interface ImportExportJobDto {
  id: string;
  jobType: "IMPORT" | "EXPORT";
  entityType: string;
  format: ExportFormat;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  progressPercent: number;
  fileName?: string | null;
  fileUrl?: string | null;
  errors?: Array<{
    row: number;
    column?: string;
    value?: unknown;
    message: string;
  }> | null;
  createdAt: string;
}

export interface ImportPreviewResultDto {
  headers: string[];
  systemFields: string[];
  columnMapping: Record<string, string>;
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  errors: Array<{
    row: number;
    column?: string;
    value?: unknown;
    message: string;
  }>;
  sampleRows: Record<string, string>[];
}

export interface ExportResponseDto {
  job: ImportExportJobDto;
  fileName: string;
  format: ExportFormat;
  recordCount: number;
  fileContent: string;
}

export const importExportApi = {
  getTemplate: (
    entityType: string,
  ): Promise<{ headers: string[]; sampleRow: Record<string, string> }> => {
    return apiClient.get<{
      headers: string[];
      sampleRow: Record<string, string>;
    }>(`/import-export/template/${entityType}`);
  },

  previewImport: (
    entityType: string,
    file: File,
  ): Promise<ImportPreviewResultDto> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", entityType);
    return apiClient.postFormData<ImportPreviewResultDto>(
      "/import-export/import/preview",
      formData,
    );
  },

  executeImport: (
    entityType: string,
    columnMapping: Record<string, string>,
    file: File,
    userId?: string,
  ): Promise<ImportExportJobDto> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", entityType);
    formData.append("columnMapping", JSON.stringify(columnMapping));
    if (userId) {
      formData.append("userId", userId);
    }
    return apiClient.postFormData<ImportExportJobDto>(
      "/import-export/import/execute",
      formData,
    );
  },

  executeExport: (params: {
    entityType: string;
    format: ExportFormat;
    selectedIds?: string[];
    columns?: string[];
  }): Promise<ExportResponseDto> => {
    return apiClient.post<ExportResponseDto>("/import-export/export", params);
  },

  getJobs: (): Promise<ImportExportJobDto[]> => {
    return apiClient.get<ImportExportJobDto[]>("/import-export/jobs");
  },

  executeBulkAction: (params: {
    entityType: string;
    action: BulkActionType;
    ids: string[];
    payload?: Record<string, unknown>;
  }): Promise<{
    entityType: string;
    action: BulkActionType;
    affectedCount: number;
    success: boolean;
  }> => {
    return apiClient.post("/import-export/bulk-action", params);
  },
};
