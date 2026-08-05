import { apiClient } from '../api-client';

export interface OverviewMetricsDto {
  totalComponents: number;
  totalLocations: number;
  totalPurchaseOrders: number;
  totalWorkOrders: number;
  totalProjects: number;
  totalTransactions: number;
  totalProcurementSpend: number;
}

export interface InventorySummaryDto {
  totalComponents: number;
  activeComponents: number;
  activeLocations: number;
  reservedQuantity: number;
  totalAdjustments: number;
  totalTransfers: number;
}

export interface ProcurementSummaryDto {
  totalPurchaseOrders: number;
  activePurchaseOrders: number;
  draftPurchaseOrders: number;
  totalSuppliers: number;
  totalGoodsReceipts: number;
  fulfilledSpend: number;
  totalProcurementSpend?: number;
}

export interface ManufacturingSummaryDto {
  totalWorkOrders: number;
  activeWorkOrders: number;
  completedWorkOrders: number;
  totalBoms: number;
  activeBoms: number;
  totalProductionOutput: number;
  totalScrapQuantity: number;
}

export interface ProjectSummaryDto {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalAllocatedMaterials: number;
  totalIssuedMaterials: number;
  totalReturnedMaterials: number;
}

export interface TransactionSummaryDto {
  totalTransactions: number;
  receiptCount: number;
  issueCount: number;
  transferCount: number;
  adjustmentCount: number;
}

export const reportingApi = {
  getOverview: (): Promise<OverviewMetricsDto> =>
    apiClient.get<OverviewMetricsDto>('/reporting/overview'),
  getInventorySummary: (): Promise<InventorySummaryDto> =>
    apiClient.get<InventorySummaryDto>('/reporting/inventory-summary'),
  getProcurementSummary: (): Promise<ProcurementSummaryDto> =>
    apiClient.get<ProcurementSummaryDto>('/reporting/procurement-summary'),
  getManufacturingSummary: (): Promise<ManufacturingSummaryDto> =>
    apiClient.get<ManufacturingSummaryDto>('/reporting/manufacturing-summary'),
  getProjectSummary: (): Promise<ProjectSummaryDto> =>
    apiClient.get<ProjectSummaryDto>('/reporting/project-summary'),
  getTransactionSummary: (): Promise<TransactionSummaryDto> =>
    apiClient.get<TransactionSummaryDto>('/reporting/transaction-summary'),
};
