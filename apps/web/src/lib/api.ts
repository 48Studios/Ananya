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

  // Warehouse - Warehouses & Bins
  getWarehouses: () => fetchApi<Record<string, unknown>[]>(`/warehouses`),
  getWarehouse: (id: string) => fetchApi<Record<string, unknown>>(`/warehouses/${id}`),
  createWarehouse: (data: { code: string; name: string; description?: string }) =>
    fetchApi<Record<string, unknown>>('/warehouses', { method: 'POST', body: JSON.stringify(data) }),
  addWarehouseBin: (id: string, data: { code: string; capacity?: number; purpose?: string }) =>
    fetchApi<Record<string, unknown>>(`/warehouses/${id}/bins`, { method: 'POST', body: JSON.stringify(data) }),
  updateWarehouseBin: (id: string, binId: string, data: { isActive?: boolean; capacity?: number }) =>
    fetchApi<Record<string, unknown>>(`/warehouses/${id}/bins/${binId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Warehouse - Stock Counts
  getStockCounts: (warehouseId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/stock-counts${q ? `?${q}` : ''}`);
  },
  getStockCount: (id: string) => fetchApi<Record<string, unknown>>(`/stock-counts/${id}`),
  createStockCount: (data: { warehouseId: string; assignedUser?: string }) =>
    fetchApi<Record<string, unknown>>('/stock-counts', { method: 'POST', body: JSON.stringify(data) }),
  assignStockCountUser: (id: string, assignedUser: string) =>
    fetchApi<Record<string, unknown>>(`/stock-counts/${id}/assign`, { method: 'POST', body: JSON.stringify({ assignedUser }) }),
  addStockCountLine: (id: string, data: { componentId: string; binId: string; expectedQuantity?: number; countedQuantity: number; notes?: string }) =>
    fetchApi<Record<string, unknown>>(`/stock-counts/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  submitStockCount: (id: string) => fetchApi<Record<string, unknown>>(`/stock-counts/${id}/submit`, { method: 'POST' }),
  approveStockCount: (id: string) => fetchApi<Record<string, unknown>>(`/stock-counts/${id}/approve`, { method: 'POST' }),
  postStockCount: (id: string) => fetchApi<Record<string, unknown>>(`/stock-counts/${id}/post`, { method: 'POST' }),
  cancelStockCount: (id: string) => fetchApi<Record<string, unknown>>(`/stock-counts/${id}/cancel`, { method: 'POST' }),

  // Warehouse - Cycle Counts
  getCycleCounts: (warehouseId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/cycle-counts${q ? `?${q}` : ''}`);
  },
  getCycleCount: (id: string) => fetchApi<Record<string, unknown>>(`/cycle-counts/${id}`),
  createCycleCount: (data: { warehouseId: string; name: string; frequency: string; selectionRule?: Record<string, unknown>; nextScheduledDate?: string }) =>
    fetchApi<Record<string, unknown>>('/cycle-counts', { method: 'POST', body: JSON.stringify(data) }),
  executeCycleCount: (id: string) => fetchApi<Record<string, unknown>>(`/cycle-counts/${id}/execute`, { method: 'POST' }),
  pauseCycleCount: (id: string) => fetchApi<Record<string, unknown>>(`/cycle-counts/${id}/pause`, { method: 'POST' }),
  resumeCycleCount: (id: string) => fetchApi<Record<string, unknown>>(`/cycle-counts/${id}/resume`, { method: 'POST' }),

  // Warehouse - Transfers
  getWarehouseTransfers: (sourceBinId?: string, destinationBinId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (sourceBinId) params.append('sourceBinId', sourceBinId);
    if (destinationBinId) params.append('destinationBinId', destinationBinId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/warehouse-transfers${q ? `?${q}` : ''}`);
  },
  getWarehouseTransfer: (id: string) => fetchApi<Record<string, unknown>>(`/warehouse-transfers/${id}`),
  createWarehouseTransfer: (data: { sourceBinId: string; destinationBinId: string }) =>
    fetchApi<Record<string, unknown>>('/warehouse-transfers', { method: 'POST', body: JSON.stringify(data) }),
  addTransferLine: (id: string, data: { componentId: string; quantity: number; batchNumber?: string; serialNumbers?: string[] }) =>
    fetchApi<Record<string, unknown>>(`/warehouse-transfers/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  approveTransfer: (id: string) => fetchApi<Record<string, unknown>>(`/warehouse-transfers/${id}/approve`, { method: 'POST' }),
  dispatchTransfer: (id: string) => fetchApi<Record<string, unknown>>(`/warehouse-transfers/${id}/dispatch`, { method: 'POST' }),
  completeTransfer: (id: string) => fetchApi<Record<string, unknown>>(`/warehouse-transfers/${id}/complete`, { method: 'POST' }),
  cancelTransfer: (id: string) => fetchApi<Record<string, unknown>>(`/warehouse-transfers/${id}/cancel`, { method: 'POST' }),

  // Warehouse - Policies
  getWarehousePolicies: () => fetchApi<Record<string, unknown>[]>(`/warehouse-policies`),
  getWarehousePolicy: (warehouseId: string) => fetchApi<Record<string, unknown>>(`/warehouse-policies/warehouse/${warehouseId}`),
  saveWarehousePolicy: (data: { warehouseId: string; allowNegativeInventory?: boolean; enforceBinCapacity?: boolean; directedPutaway?: boolean; directedPicking?: boolean; defaultReceivingBinId?: string; defaultProductionBinId?: string; defaultShippingBinId?: string }) =>
    fetchApi<Record<string, unknown>>('/warehouse-policies', { method: 'POST', body: JSON.stringify(data) }),

  // Sales - Customers
  getCustomers: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/customers${q ? `?${q}` : ''}`);
  },
  getCustomer: (id: string) => fetchApi<Record<string, unknown>>(`/customers/${id}`),
  createCustomer: (data: { name: string; email: string; phone?: string; taxId?: string; currency?: string }) =>
    fetchApi<Record<string, unknown>>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  activateCustomer: (id: string) => fetchApi<Record<string, unknown>>(`/customers/${id}/activate`, { method: 'POST' }),
  suspendCustomer: (id: string) => fetchApi<Record<string, unknown>>(`/customers/${id}/suspend`, { method: 'POST' }),
  addCustomerContact: (id: string, data: { name: string; email: string; phone?: string; role?: string; isPrimary?: boolean }) =>
    fetchApi<Record<string, unknown>>(`/customers/${id}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
  addCustomerAddress: (id: string, data: { addressType: string; street1: string; street2?: string; city: string; state?: string; postalCode: string; country: string; isDefault?: boolean }) =>
    fetchApi<Record<string, unknown>>(`/customers/${id}/addresses`, { method: 'POST', body: JSON.stringify(data) }),

  // Sales - Quotations
  getQuotations: (customerId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/quotations${q ? `?${q}` : ''}`);
  },
  getQuotation: (id: string) => fetchApi<Record<string, unknown>>(`/quotations/${id}`),
  createQuotation: (data: { customerId: string; currency?: string; validUntil?: string }) =>
    fetchApi<Record<string, unknown>>('/quotations', { method: 'POST', body: JSON.stringify(data) }),
  addQuotationLine: (id: string, data: { componentId: string; quantity: number; unitPrice: number; discount?: number }) =>
    fetchApi<Record<string, unknown>>(`/quotations/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  sendQuotation: (id: string) => fetchApi<Record<string, unknown>>(`/quotations/${id}/send`, { method: 'POST' }),
  acceptQuotation: (id: string) => fetchApi<Record<string, unknown>>(`/quotations/${id}/accept`, { method: 'POST' }),
  cancelQuotation: (id: string) => fetchApi<Record<string, unknown>>(`/quotations/${id}/cancel`, { method: 'POST' }),

  // Sales - Sales Orders
  getSalesOrders: (customerId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/sales-orders${q ? `?${q}` : ''}`);
  },
  getSalesOrder: (id: string) => fetchApi<Record<string, unknown>>(`/sales-orders/${id}`),
  createSalesOrder: (data: { customerId: string; orderDate?: string; requiredDate?: string; quotationId?: string }) =>
    fetchApi<Record<string, unknown>>('/sales-orders', { method: 'POST', body: JSON.stringify(data) }),
  convertQuotationToSalesOrder: (data: { quotationId: string; requiredDate?: string }) =>
    fetchApi<Record<string, unknown>>('/sales-orders/convert-quotation', { method: 'POST', body: JSON.stringify(data) }),
  addSalesOrderLine: (id: string, data: { componentId: string; quantity: number; unitPrice: number; discount?: number; tax?: number }) =>
    fetchApi<Record<string, unknown>>(`/sales-orders/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  approveSalesOrder: (id: string) => fetchApi<Record<string, unknown>>(`/sales-orders/${id}/approve`, { method: 'POST' }),
  releaseSalesOrder: (id: string) => fetchApi<Record<string, unknown>>(`/sales-orders/${id}/release`, { method: 'POST' }),
  cancelSalesOrder: (id: string) => fetchApi<Record<string, unknown>>(`/sales-orders/${id}/cancel`, { method: 'POST' }),

  // Sales - Fulfillment Requests
  getFulfillmentRequests: (salesOrderId?: string, warehouseId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (salesOrderId) params.append('salesOrderId', salesOrderId);
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/fulfillment${q ? `?${q}` : ''}`);
  },
  getFulfillmentRequest: (id: string) => fetchApi<Record<string, unknown>>(`/fulfillment/${id}`),
  createFulfillmentRequest: (data: { salesOrderId: string; warehouseId: string }) =>
    fetchApi<Record<string, unknown>>('/fulfillment', { method: 'POST', body: JSON.stringify(data) }),
  addFulfillmentLine: (id: string, data: { salesOrderLineId: string; componentId: string; requestedQuantity: number }) =>
    fetchApi<Record<string, unknown>>(`/fulfillment/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  acceptFulfillmentRequest: (id: string) => fetchApi<Record<string, unknown>>(`/fulfillment/${id}/accept`, { method: 'POST' }),
  startPickingFulfillmentRequest: (id: string) => fetchApi<Record<string, unknown>>(`/fulfillment/${id}/pick`, { method: 'POST' }),
  packFulfillmentRequest: (id: string) => fetchApi<Record<string, unknown>>(`/fulfillment/${id}/pack`, { method: 'POST' }),
  shipFulfillmentRequest: (id: string, data: { carrierName: string; trackingNumber: string }) =>
    fetchApi<Record<string, unknown>>(`/fulfillment/${id}/ship`, { method: 'POST', body: JSON.stringify(data) }),
  completeFulfillmentRequest: (id: string) => fetchApi<Record<string, unknown>>(`/fulfillment/${id}/complete`, { method: 'POST' }),
  cancelFulfillmentRequest: (id: string) => fetchApi<Record<string, unknown>>(`/fulfillment/${id}/cancel`, { method: 'POST' }),

  // Sales - Customer Returns
  getCustomerReturns: (customerId?: string, salesOrderId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (salesOrderId) params.append('salesOrderId', salesOrderId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/customer-returns${q ? `?${q}` : ''}`);
  },
  getCustomerReturn: (id: string) => fetchApi<Record<string, unknown>>(`/customer-returns/${id}`),
  createCustomerReturn: (data: { customerId: string; salesOrderId: string; notes?: string }) =>
    fetchApi<Record<string, unknown>>('/customer-returns', { method: 'POST', body: JSON.stringify(data) }),
  addCustomerReturnLine: (id: string, data: { salesOrderLineId: string; componentId: string; quantity: number; reason: string }) =>
    fetchApi<Record<string, unknown>>(`/customer-returns/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  approveCustomerReturn: (id: string) => fetchApi<Record<string, unknown>>(`/customer-returns/${id}/approve`, { method: 'POST' }),
  receiveCustomerReturn: (id: string) => fetchApi<Record<string, unknown>>(`/customer-returns/${id}/receive`, { method: 'POST' }),
  inspectCustomerReturn: (id: string, dispositions: Record<string, string>) =>
    fetchApi<Record<string, unknown>>(`/customer-returns/${id}/inspect`, { method: 'POST', body: JSON.stringify({ dispositions }) }),
  restockCustomerReturn: (id: string) => fetchApi<Record<string, unknown>>(`/customer-returns/${id}/restock`, { method: 'POST' }),
  rejectCustomerReturn: (id: string) => fetchApi<Record<string, unknown>>(`/customer-returns/${id}/reject`, { method: 'POST' }),
  closeCustomerReturn: (id: string) => fetchApi<Record<string, unknown>>(`/customer-returns/${id}/close`, { method: 'POST' }),

  // Finance - Chart of Accounts
  getAccounts: (accountType?: string, isActive?: boolean, search?: string) => {
    const params = new URLSearchParams();
    if (accountType) params.append('accountType', accountType);
    if (isActive !== undefined) params.append('isActive', String(isActive));
    if (search) params.append('search', search);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/accounts${q ? `?${q}` : ''}`);
  },
  getAccount: (id: string) => fetchApi<Record<string, unknown>>(`/accounts/${id}`),
  createAccount: (data: { accountNumber: string; name: string; accountType: string; parentAccountId?: string; currency?: string }) =>
    fetchApi<Record<string, unknown>>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
  activateAccount: (id: string) => fetchApi<Record<string, unknown>>(`/accounts/${id}/activate`, { method: 'POST' }),
  deactivateAccount: (id: string) => fetchApi<Record<string, unknown>>(`/accounts/${id}/deactivate`, { method: 'POST' }),

  // Finance - Journal Entries
  getJournalEntries: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/journal-entries${q ? `?${q}` : ''}`);
  },
  getJournalEntry: (id: string) => fetchApi<Record<string, unknown>>(`/journal-entries/${id}`),
  createJournalEntry: (data: { description: string; date?: string; reference?: string }) =>
    fetchApi<Record<string, unknown>>('/journal-entries', { method: 'POST', body: JSON.stringify(data) }),
  addJournalLine: (id: string, data: { accountId: string; debit: number; credit: number; description?: string }) =>
    fetchApi<Record<string, unknown>>(`/journal-entries/${id}/lines`, { method: 'POST', body: JSON.stringify(data) }),
  postJournalEntry: (id: string) => fetchApi<Record<string, unknown>>(`/journal-entries/${id}/post`, { method: 'POST' }),
  reverseJournalEntry: (id: string) => fetchApi<Record<string, unknown>>(`/journal-entries/${id}/reverse`, { method: 'POST' }),
  voidJournalEntry: (id: string) => fetchApi<Record<string, unknown>>(`/journal-entries/${id}/void`, { method: 'POST' }),

  // Finance - Accounts Receivable
  getReceivableInvoices: (customerId?: string, salesOrderId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (customerId) params.append('customerId', customerId);
    if (salesOrderId) params.append('salesOrderId', salesOrderId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/receivable-invoices${q ? `?${q}` : ''}`);
  },
  getReceivableInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/receivable-invoices/${id}`),
  createReceivableInvoice: (data: { customerId: string; salesOrderId: string; dueDate: string; amount: number }) =>
    fetchApi<Record<string, unknown>>('/receivable-invoices', { method: 'POST', body: JSON.stringify(data) }),
  postReceivableInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/receivable-invoices/${id}/post`, { method: 'POST' }),
  cancelReceivableInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/receivable-invoices/${id}/cancel`, { method: 'POST' }),

  // Finance - Accounts Payable
  getPayableInvoices: (supplierId?: string, purchaseInvoiceId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (supplierId) params.append('supplierId', supplierId);
    if (purchaseInvoiceId) params.append('purchaseInvoiceId', purchaseInvoiceId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/payable-invoices${q ? `?${q}` : ''}`);
  },
  getPayableInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/payable-invoices/${id}`),
  createPayableInvoice: (data: { supplierId: string; purchaseInvoiceId: string; dueDate: string; amount: number }) =>
    fetchApi<Record<string, unknown>>('/payable-invoices', { method: 'POST', body: JSON.stringify(data) }),
  postPayableInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/payable-invoices/${id}/post`, { method: 'POST' }),
  cancelPayableInvoice: (id: string) => fetchApi<Record<string, unknown>>(`/payable-invoices/${id}/cancel`, { method: 'POST' }),

  // Finance - Payments
  getPayments: (paymentType?: string, bankAccountId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (paymentType) params.append('paymentType', paymentType);
    if (bankAccountId) params.append('bankAccountId', bankAccountId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/payments${q ? `?${q}` : ''}`);
  },
  getPayment: (id: string) => fetchApi<Record<string, unknown>>(`/payments/${id}`),
  createPayment: (data: { paymentType: string; paymentMethod: string; amount: number; reference?: string; bankAccountId?: string; targetInvoiceId?: string }) =>
    fetchApi<Record<string, unknown>>('/payments', { method: 'POST', body: JSON.stringify(data) }),
  postPayment: (id: string, targetInvoiceId?: string) =>
    fetchApi<Record<string, unknown>>(`/payments/${id}/post`, { method: 'POST', body: JSON.stringify({ targetInvoiceId }) }),
  cancelPayment: (id: string) => fetchApi<Record<string, unknown>>(`/payments/${id}/cancel`, { method: 'POST' }),

  // Finance - Bank Reconciliations
  getBankReconciliations: (bankAccountId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (bankAccountId) params.append('bankAccountId', bankAccountId);
    if (status) params.append('status', status);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/bank-reconciliations${q ? `?${q}` : ''}`);
  },
  getBankReconciliation: (id: string) => fetchApi<Record<string, unknown>>(`/bank-reconciliations/${id}`),
  createBankReconciliation: (data: { bankAccountId: string; statementDate: string; openingBalance: number; closingBalance: number }) =>
    fetchApi<Record<string, unknown>>('/bank-reconciliations', { method: 'POST', body: JSON.stringify(data) }),
  addBankTransaction: (id: string, data: { transactionDate: string; description: string; amount: number }) =>
    fetchApi<Record<string, unknown>>(`/bank-reconciliations/${id}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
  matchBankTransaction: (id: string, data: { transactionId: string; paymentId: string }) =>
    fetchApi<Record<string, unknown>>(`/bank-reconciliations/${id}/match`, { method: 'POST', body: JSON.stringify(data) }),
  completeBankReconciliation: (id: string) => fetchApi<Record<string, unknown>>(`/bank-reconciliations/${id}/complete`, { method: 'POST' }),

  // CRM - Leads
  getLeads: (status?: string, source?: string, owner?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (source) params.append('source', source);
    if (owner) params.append('owner', owner);
    if (search) params.append('search', search);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/leads${q ? `?${q}` : ''}`);
  },
  getLead: (id: string) => fetchApi<Record<string, unknown>>(`/leads/${id}`),
  createLead: (data: { name: string; company: string; email?: string; phone?: string; source?: string; industry?: string; owner: string }) =>
    fetchApi<Record<string, unknown>>('/leads', { method: 'POST', body: JSON.stringify(data) }),
  assignLead: (id: string, owner: string) =>
    fetchApi<Record<string, unknown>>(`/leads/${id}/assign`, { method: 'POST', body: JSON.stringify({ owner }) }),
  qualifyLead: (id: string) => fetchApi<Record<string, unknown>>(`/leads/${id}/qualify`, { method: 'POST' }),
  disqualifyLead: (id: string, reason: string) =>
    fetchApi<Record<string, unknown>>(`/leads/${id}/disqualify`, { method: 'POST', body: JSON.stringify({ reason }) }),
  convertLead: (id: string) => fetchApi<Record<string, unknown>>(`/leads/${id}/convert`, { method: 'POST' }),

  // CRM - Accounts & Contacts
  getCrmAccounts: (isArchived?: boolean, search?: string) => {
    const params = new URLSearchParams();
    if (isArchived !== undefined) params.append('isArchived', String(isArchived));
    if (search) params.append('search', search);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/crm-accounts${q ? `?${q}` : ''}`);
  },
  getCrmAccount: (id: string) => fetchApi<Record<string, unknown>>(`/crm-accounts/${id}`),
  createCrmAccount: (data: { companyName: string; industry?: string; website?: string; billingAddress?: string; shippingAddress?: string }) =>
    fetchApi<Record<string, unknown>>('/crm-accounts', { method: 'POST', body: JSON.stringify(data) }),
  addCrmContact: (id: string, data: { firstName: string; lastName: string; email: string; phone?: string; role?: string; isPrimary?: boolean }) =>
    fetchApi<Record<string, unknown>>(`/crm-accounts/${id}/contacts`, { method: 'POST', body: JSON.stringify(data) }),
  archiveCrmAccount: (id: string) => fetchApi<Record<string, unknown>>(`/crm-accounts/${id}/archive`, { method: 'POST' }),

  // CRM - Opportunities
  getOpportunities: (crmAccountId?: string, stage?: string, search?: string) => {
    const params = new URLSearchParams();
    if (crmAccountId) params.append('crmAccountId', crmAccountId);
    if (stage) params.append('stage', stage);
    if (search) params.append('search', search);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/opportunities${q ? `?${q}` : ''}`);
  },
  getOpportunity: (id: string) => fetchApi<Record<string, unknown>>(`/opportunities/${id}`),
  createOpportunity: (data: { name: string; leadId?: string; crmAccountId: string; estimatedValue: number; expectedCloseDate: string; probability?: number }) =>
    fetchApi<Record<string, unknown>>('/opportunities', { method: 'POST', body: JSON.stringify(data) }),
  advanceOpportunityStage: (id: string, stage: string) =>
    fetchApi<Record<string, unknown>>(`/opportunities/${id}/advance`, { method: 'POST', body: JSON.stringify({ stage }) }),
  winOpportunity: (id: string) => fetchApi<Record<string, unknown>>(`/opportunities/${id}/win`, { method: 'POST' }),
  loseOpportunity: (id: string, reason: string) =>
    fetchApi<Record<string, unknown>>(`/opportunities/${id}/lose`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // CRM - Activities
  getActivities: (type?: string, status?: string, owner?: string, relatedLeadId?: string, relatedAccountId?: string, relatedOpportunityId?: string) => {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (owner) params.append('owner', owner);
    if (relatedLeadId) params.append('relatedLeadId', relatedLeadId);
    if (relatedAccountId) params.append('relatedAccountId', relatedAccountId);
    if (relatedOpportunityId) params.append('relatedOpportunityId', relatedOpportunityId);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/activities${q ? `?${q}` : ''}`);
  },
  getActivity: (id: string) => fetchApi<Record<string, unknown>>(`/activities/${id}`),
  createActivity: (data: { type: string; subject: string; dueDate: string; owner: string; relatedLeadId?: string; relatedAccountId?: string; relatedOpportunityId?: string }) =>
    fetchApi<Record<string, unknown>>('/activities', { method: 'POST', body: JSON.stringify(data) }),
  completeActivity: (id: string) => fetchApi<Record<string, unknown>>(`/activities/${id}/complete`, { method: 'POST' }),
  cancelActivity: (id: string) => fetchApi<Record<string, unknown>>(`/activities/${id}/cancel`, { method: 'POST' }),

  // CRM - Notes
  getNotes: (leadId?: string, crmAccountId?: string, opportunityId?: string, activityId?: string) => {
    const params = new URLSearchParams();
    if (leadId) params.append('leadId', leadId);
    if (crmAccountId) params.append('crmAccountId', crmAccountId);
    if (opportunityId) params.append('opportunityId', opportunityId);
    if (activityId) params.append('activityId', activityId);
    const q = params.toString();
    return fetchApi<Record<string, unknown>[]>(`/notes${q ? `?${q}` : ''}`);
  },
  getNote: (id: string) => fetchApi<Record<string, unknown>>(`/notes/${id}`),
  createNote: (data: { author: string; body: string; leadId?: string; crmAccountId?: string; opportunityId?: string; activityId?: string }) =>
    fetchApi<Record<string, unknown>>('/notes', { method: 'POST', body: JSON.stringify(data) }),
};





