import type {
  Component,
  Location,
  Manufacturer,
  Unit,
  InventoryTransaction,
  InventoryProjection,
  Reservation,
  Batch,
  Serial,
} from '@ananya/inventory';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : errorData.message;
      }
    } catch {
      // Ignore json parse error for non-json responses
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export const api = {
  // Components
  getComponents: () => fetchApi<Component[]>('/components'),
  getComponent: (id: string) => fetchApi<Component>(`/components/${id}`),
  createComponent: (data: {
    sku: string;
    name: string;
    description?: string;
    manufacturerId?: string;
    categoryId?: string;
    defaultLocationId?: string;
    unit: string;
  }) =>
    fetchApi<Component>('/components', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Locations
  getLocations: () => fetchApi<Location[]>('/locations'),
  getLocation: (id: string) => fetchApi<Location>(`/locations/${id}`),
  createLocation: (data: {
    code: string;
    name: string;
    kind: string;
    parentId?: string | null;
    metadata?: Record<string, unknown>;
  }) =>
    fetchApi<Location>('/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Manufacturers
  getManufacturers: () => fetchApi<Manufacturer[]>('/manufacturers'),
  getManufacturer: (id: string) => fetchApi<Manufacturer>(`/manufacturers/${id}`),
  createManufacturer: (data: { code: string; name: string }) =>
    fetchApi<Manufacturer>('/manufacturers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Units
  getUnits: () => fetchApi<Unit[]>('/units'),
  getUnit: (id: string) => fetchApi<Unit>(`/units/${id}`),
  createUnit: (data: {
    name: string;
    category: string;
    isBaseUnit: boolean;
    conversionFactor?: number;
    precision: number;
  }) =>
    fetchApi<Unit>('/units', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Ledger Transactions
  getTransactions: () => fetchApi<InventoryTransaction[]>('/inventory-transactions'),
  getTransaction: (id: string) => fetchApi<InventoryTransaction>(`/inventory-transactions/${id}`),
  createTransaction: (data: {
    componentId: string;
    quantity: number;
    unitOfMeasure: string;
    sourceLocationId?: string;
    destinationLocationId?: string;
    transactionType: string;
    reference?: string;
    reason?: string;
    createdBy: string;
  }) =>
    fetchApi<InventoryTransaction>('/inventory-transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Inventory Projections
  getProjectionsByComponent: (componentId: string) =>
    fetchApi<InventoryProjection[]>(`/inventory-projections/component/${componentId}`),
  getProjectionsByLocation: (locationId: string) =>
    fetchApi<InventoryProjection[]>(`/inventory-projections/location/${locationId}`),
  getProjectionQuery: (componentId: string, locationId: string) =>
    fetchApi<InventoryProjection>(
      `/inventory-projections/query?componentId=${encodeURIComponent(
        componentId
      )}&locationId=${encodeURIComponent(locationId)}`
    ),
  rebuildProjections: () =>
    fetchApi<{ message: string }>('/inventory-projections/rebuild', {
      method: 'POST',
    }),

  // Reservations
  getAvailableQuantity: (componentId: string, locationId: string) =>
    fetchApi<{ componentId: string; locationId: string; availableQuantity: number }>(
      `/reservations/available?componentId=${encodeURIComponent(
        componentId
      )}&locationId=${encodeURIComponent(locationId)}`
    ),
  getReservation: (id: string) => fetchApi<Reservation>(`/reservations/${id}`),
  createReservation: (data: {
    componentId: string;
    locationId: string;
    quantity: number;
    unitOfMeasure: string;
    reference?: string;
    reservedBy: string;
    expiresAt?: string;
  }) =>
    fetchApi<Reservation>('/reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  fulfillReservation: (id: string) =>
    fetchApi<Reservation>(`/reservations/${id}/fulfill`, { method: 'PATCH' }),
  cancelReservation: (id: string) =>
    fetchApi<Reservation>(`/reservations/${id}/cancel`, { method: 'PATCH' }),

  // Batches
  getBatchesByComponent: (componentId: string) =>
    fetchApi<Batch[]>(`/batches/component/${componentId}`),
  getBatch: (id: string) => fetchApi<Batch>(`/batches/${id}`),
  createBatch: (data: {
    componentId: string;
    batchNumber: string;
    manufacturingDate?: string;
    expiryDate?: string;
    supplierBatchNumber?: string;
  }) =>
    fetchApi<Batch>('/batches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Serials
  getSerialsByComponent: (componentId: string) =>
    fetchApi<Serial[]>(`/serials/component/${componentId}`),
  getSerial: (id: string) => fetchApi<Serial>(`/serials/${id}`),
  createSerial: (data: {
    componentId: string;
    serialNumber: string;
    locationId?: string;
  }) =>
    fetchApi<Serial>('/serials', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Suppliers
  getSuppliers: (search?: string) =>
    fetchApi<Record<string, unknown>[]>(`/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getSupplier: (id: string) => fetchApi<Record<string, unknown>>(`/suppliers/${id}`),
  createSupplier: (data: { code: string; name: string; taxId?: string; paymentTerms?: string; currency?: string }) =>
    fetchApi<Record<string, unknown>>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  addSupplierContact: (id: string, data: { name: string; email?: string; phone?: string; role?: string; isPrimary?: boolean }) =>
    fetchApi<void>(`/suppliers/${id}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
  mapSupplierComponent: (id: string, data: { componentId: string; vendorPartNumber: string; unitPrice?: number; leadTimeDays?: number }) =>
    fetchApi<void>(`/suppliers/${id}/components`, { method: 'POST', body: JSON.stringify(data) }),

  // Purchase Orders
  getPurchaseOrders: (supplierId?: string) =>
    fetchApi<Record<string, unknown>[]>(`/purchase-orders${supplierId ? `?supplierId=${supplierId}` : ''}`),
  getPurchaseOrder: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-orders/${id}`),
  createPurchaseOrder: (data: { supplierId: string; currency?: string; notes?: string; expectedDeliveryDate?: string }) =>
    fetchApi<Record<string, unknown>>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  addPoLine: (id: string, data: { componentId: string; vendorPartNumber?: string; unitPrice: number; quantityOrdered: number; taxRate?: number }) =>
    fetchApi<Record<string, unknown>>(`/purchase-orders/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  submitPo: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-orders/${id}/submit`, { method: 'POST' }),
  approvePo: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-orders/${id}/approve`, { method: 'POST' }),
  issuePo: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-orders/${id}/issue`, { method: 'POST' }),
  cancelPo: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-orders/${id}/cancel`, { method: 'POST' }),

  // Goods Receipts
  getGoodsReceipts: (purchaseOrderId?: string) =>
    fetchApi<Record<string, unknown>[]>(`/goods-receipts${purchaseOrderId ? `?purchaseOrderId=${purchaseOrderId}` : ''}`),
  getGoodsReceipt: (id: string) => fetchApi<Record<string, unknown>>(`/goods-receipts/${id}`),
  createGoodsReceipt: (data: { purchaseOrderId: string; supplierId: string; packingSlipNumber?: string }) =>
    fetchApi<Record<string, unknown>>('/goods-receipts', { method: 'POST', body: JSON.stringify(data) }),
  addGrLine: (id: string, data: { poLineId: string; componentId: string; locationId: string; quantityReceived: number; batchNumber?: string; serialNumbers?: string[] }) =>
    fetchApi<Record<string, unknown>>(`/goods-receipts/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  postGoodsReceipt: (id: string) => fetchApi<Record<string, unknown>>(`/goods-receipts/${id}/post`, { method: 'POST' }),

  // Supplier Returns
  getSupplierReturns: () => fetchApi<Record<string, unknown>[]>(`/supplier-returns`),
  getSupplierReturn: (id: string) => fetchApi<Record<string, unknown>>(`/supplier-returns/${id}`),
  createSupplierReturn: (data: { supplierId: string; purchaseOrderId?: string; rmaNumber?: string }) =>
    fetchApi<Record<string, unknown>>('/supplier-returns', { method: 'POST', body: JSON.stringify(data) }),
  addReturnLine: (id: string, data: { componentId: string; locationId: string; quantityReturned: number; unitPrice: number; reason: string }) =>
    fetchApi<Record<string, unknown>>(`/supplier-returns/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  approveReturn: (id: string, rmaNumber?: string) =>
    fetchApi<Record<string, unknown>>(`/supplier-returns/${id}/approve`, { method: 'POST', body: JSON.stringify({ rmaNumber }) }),
  dispatchReturn: (id: string) => fetchApi<Record<string, unknown>>(`/supplier-returns/${id}/dispatch`, { method: 'POST' }),

  // Purchase Invoices
  getPurchaseInvoices: () => fetchApi<Record<string, unknown>[]>(`/purchase-invoices`),
  getPurchaseInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-invoices/${id}`),
  createPurchaseInvoice: (data: { vendorInvoiceNumber: string; supplierId: string; purchaseOrderId: string; dueDate: string }) =>
    fetchApi<Record<string, unknown>>('/purchase-invoices', { method: 'POST', body: JSON.stringify(data) }),
  addInvoiceLine: (id: string, data: { componentId: string; quantityBilled: number; unitPrice: number }) =>
    fetchApi<Record<string, unknown>>(`/purchase-invoices/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  matchInvoice: (id: string) =>
    fetchApi<{ invoice: Record<string, unknown>; matchResult: { isMatch: boolean; details: string[] } }>(`/purchase-invoices/${id}/match`, { method: 'POST' }),
  approveInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/purchase-invoices/${id}/approve`, { method: 'POST' }),

  // Policies & Reporting
  getProcurementPolicies: () => fetchApi<Record<string, unknown>[]>(`/procurement-policies`),
  createProcurementPolicy: (data: { policyType: string; name: string; thresholdAmount?: number; overReceiptTolerancePercent?: number }) =>
    fetchApi<Record<string, unknown>>('/procurement-policies', { method: 'POST', body: JSON.stringify(data) }),
  getProcurementMetrics: () => fetchApi<Record<string, unknown>>('/procurement/reporting/metrics'),
  getOpenPoAging: () => fetchApi<Record<string, unknown>[]>(`/procurement/reporting/open-po-aging`),

  // Manufacturing - BOMs
  getBoms: (componentId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (componentId) params.append('componentId', componentId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/boms${q ? `?${q}` : ''}`);
  },
  getBom: (id: string) => fetchApi<Record<string, unknown>>(`/boms/${id}`),
  createBom: (data: { componentId: string; revision?: string; notes?: string }) =>
    fetchApi<Record<string, unknown>>('/boms', { method: 'POST', body: JSON.stringify(data) }),
  addBomLine: (id: string, data: { componentId: string; quantityPerUnit: number; unitOfMeasure?: string; scrapFactorPercent?: number; notes?: string }) =>
    fetchApi<Record<string, unknown>>(`/boms/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  releaseBom: (id: string) => fetchApi<Record<string, unknown>>(`/boms/${id}/release`, { method: 'POST' }),
  obsoleteBom: (id: string) => fetchApi<Record<string, unknown>>(`/boms/${id}/obsolete`, { method: 'POST' }),

  // Manufacturing - Production Orders
  getProductionOrders: (componentId?: string, bomId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (componentId) params.append('componentId', componentId);
    if (bomId) params.append('bomId', bomId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/production-orders${q ? `?${q}` : ''}`);
  },
  getProductionOrder: (id: string) => fetchApi<Record<string, unknown>>(`/production-orders/${id}`),
  createProductionOrder: (data: { bomId: string; componentId: string; quantityPlanned: number; startDate?: string; endDate?: string }) =>
    fetchApi<Record<string, unknown>>('/production-orders', { method: 'POST', body: JSON.stringify(data) }),
  releaseProductionOrder: (id: string) => fetchApi<Record<string, unknown>>(`/production-orders/${id}/release`, { method: 'POST' }),
  startProductionOrder: (id: string) => fetchApi<Record<string, unknown>>(`/production-orders/${id}/start`, { method: 'POST' }),
  completeProductionOrder: (id: string) => fetchApi<Record<string, unknown>>(`/production-orders/${id}/complete`, { method: 'POST' }),
  closeProductionOrder: (id: string) => fetchApi<Record<string, unknown>>(`/production-orders/${id}/close`, { method: 'POST' }),
  cancelProductionOrder: (id: string) => fetchApi<Record<string, unknown>>(`/production-orders/${id}/cancel`, { method: 'POST' }),

  // Manufacturing - Material Consumptions
  getMaterialConsumptions: (productionOrderId?: string) =>
    fetchApi<Record<string, unknown>[]>(`/material-consumptions${productionOrderId ? `?productionOrderId=${productionOrderId}` : ''}`),
  getMaterialConsumption: (id: string) => fetchApi<Record<string, unknown>>(`/material-consumptions/${id}`),
  createMaterialConsumption: (data: { productionOrderId: string }) =>
    fetchApi<Record<string, unknown>>('/material-consumptions', { method: 'POST', body: JSON.stringify(data) }),
  addConsumptionLine: (id: string, data: { componentId: string; locationId: string; quantityPlanned?: number; quantityConsumed: number; batchNumber?: string; serialNumbers?: string[] }) =>
    fetchApi<Record<string, unknown>>(`/material-consumptions/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  postMaterialConsumption: (id: string) => fetchApi<Record<string, unknown>>(`/material-consumptions/${id}/post`, { method: 'POST' }),

  // Manufacturing - Finished Goods Receipts
  getFinishedGoodsReceipts: (productionOrderId?: string) =>
    fetchApi<Record<string, unknown>[]>(`/finished-goods${productionOrderId ? `?productionOrderId=${productionOrderId}` : ''}`),
  getFinishedGoodsReceipt: (id: string) => fetchApi<Record<string, unknown>>(`/finished-goods/${id}`),
  createFinishedGoodsReceipt: (data: { productionOrderId: string }) =>
    fetchApi<Record<string, unknown>>('/finished-goods', { method: 'POST', body: JSON.stringify(data) }),
  addFgrLine: (id: string, data: { componentId: string; locationId: string; quantityProduced: number; quantityScrapped?: number; batchNumber?: string; serialNumbers?: string[] }) =>
    fetchApi<Record<string, unknown>>(`/finished-goods/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  postFinishedGoodsReceipt: (id: string) => fetchApi<Record<string, unknown>>(`/finished-goods/${id}/post`, { method: 'POST' }),

  // Manufacturing - Traceability
  getForwardTrace: (params: { batchNumber?: string; serialNumber?: string; componentId?: string }) => {
    const q = new URLSearchParams();
    if (params.batchNumber) q.append('batchNumber', params.batchNumber);
    if (params.serialNumber) q.append('serialNumber', params.serialNumber);
    if (params.componentId) q.append('componentId', params.componentId);
    return fetchApi<Record<string, unknown>[]>(`/traceability/forward?${q.toString()}`);
  },
  getBackwardTrace: (params: { batchNumber?: string; serialNumber?: string; componentId?: string }) => {
    const q = new URLSearchParams();
    if (params.batchNumber) q.append('batchNumber', params.batchNumber);
    if (params.serialNumber) q.append('serialNumber', params.serialNumber);
    if (params.componentId) q.append('componentId', params.componentId);
    return fetchApi<Record<string, unknown>[]>(`/traceability/backward?${q.toString()}`);
  },
  getProductionOrderTrace: (id: string) => fetchApi<Record<string, unknown>[]>(`/traceability/production-order/${id}`),
};

