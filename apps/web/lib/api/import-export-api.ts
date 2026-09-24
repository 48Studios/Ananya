import { apiClient } from "../api-client";

export type ExportFormat = "CSV" | "EXCEL" | "JSON";
export type BulkActionType =
  | "DELETE"
  | "ARCHIVE"
  | "UPDATE_STATUS"
  | "ASSIGN_CATEGORY"
  | "ASSIGN_LOCATION"
  | "ASSIGN_MANUFACTURER";

/**
 * What happened to one selected record. `SKIPPED` is a refusal — the record was
 * left untouched because a domain rule said no — while `FAILED` means the write
 * itself did not complete. The API decides which is which.
 */
export type BulkActionOutcome = "APPLIED" | "SKIPPED" | "FAILED";

export interface BulkActionItemResultDto {
  id: string;
  outcome: BulkActionOutcome;
  /** Why the record was skipped or failed; `null` when it was applied. */
  reason: string | null;
}

export interface BulkActionResultDto {
  entityType: string;
  action: BulkActionType;
  requestedCount: number;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  results: BulkActionItemResultDto[];
}

export interface BulkActionSupportDto {
  entityType: string;
  supportedActions: BulkActionType[];
}

export interface ImportExportJobDto {
  id: string;
  jobType: "IMPORT" | "EXPORT";
  entityType: string;
  format: ExportFormat;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "REVERSED";
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
  createdEntities?: Array<{
    entityType: string;
    id: string;
    isSideEffect?: boolean;
  }> | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ImportPreviewResultDto {
  entityType?: string;
  label?: string;
  description?: string;
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

export const ENTITY_LABEL_MAP: Record<string, string> = {
  Category: "Category",
  Component: "Component",
  Manufacturer: "Manufacturer",
  Supplier: "Supplier",
  Customer: "Customer",
  Warehouse: "Warehouse",
  WarehouseBin: "Warehouse Bin",
  Location: "Location",
  Unit: "Unit of Measure",
  User: "User Account",
  Role: "Security Role",
  Permission: "System Permission",
  Project: "Project",
  Task: "Project Task",
  BOM: "Bill of Materials",
  WorkOrder: "Work Order",
  PurchaseOrder: "Purchase Order",
  OpeningInventory: "Opening Inventory Balance",
  StockAdjustment: "Stock Adjustment",
  Asset: "Fixed Asset",
  Equipment: "Equipment",
  MaintenanceSchedule: "Maintenance Schedule",
  ServiceRequest: "Service Request",
  Warranty: "Warranty Coverage",
  RMA: "Return Merchandise Authorization",
};

export function getEntityLabel(entityType: string): string {
  if (!entityType) return "";
  if (ENTITY_LABEL_MAP[entityType]) {
    return ENTITY_LABEL_MAP[entityType]!;
  }
  return entityType.replace(/([A-Z])/g, " $1").trim();
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

  getTemplateCsv: (entityType: string): Promise<string> => {
    return apiClient.get<string>(`/import-export/template/${entityType}/csv`);
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

  getJob: (id: string): Promise<ImportExportJobDto> => {
    return apiClient.get<ImportExportJobDto>(`/import-export/jobs/${id}`);
  },

  reverseImport: (
    id: string,
  ): Promise<{
    success: boolean;
    message: string;
    revertedCount: number;
    job: ImportExportJobDto;
  }> => {
    return apiClient.post(`/import-export/jobs/${id}/reverse`, {});
  },

  executeBulkAction: (params: {
    entityType: string;
    action: BulkActionType;
    ids: string[];
    payload?: Record<string, unknown>;
  }): Promise<BulkActionResultDto> => {
    return apiClient.post<BulkActionResultDto>(
      "/import-export/bulk-action",
      params,
    );
  },

  /**
   * The actions the API can genuinely carry out for this entity type. The
   * toolbar renders from this list, so an action with no real mutation behind
   * it is never offered.
   */
  getSupportedBulkActions: (
    entityType: string,
  ): Promise<BulkActionSupportDto> => {
    return apiClient.get<BulkActionSupportDto>(
      `/import-export/bulk-actions/${encodeURIComponent(entityType)}`,
    );
  },
};
