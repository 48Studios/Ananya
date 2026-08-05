import { PurchaseInvoice } from "./purchase-invoice";

export interface FindManyPurchaseInvoicesOptions {
  supplierId?: string;
  purchaseOrderId?: string;
  status?: string;
}

export interface PurchaseInvoiceRepository {
  findById(id: string): Promise<PurchaseInvoice | null>;
  findByInvoiceNumber(invoiceNumber: string): Promise<PurchaseInvoice | null>;
  findMany(
    options?: FindManyPurchaseInvoicesOptions,
  ): Promise<PurchaseInvoice[]>;
  save(invoice: PurchaseInvoice): Promise<void>;
  generateNextInvoiceNumber(): Promise<string>;
}
