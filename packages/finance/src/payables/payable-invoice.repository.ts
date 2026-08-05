import { PayableInvoice, PayableStatus } from "./payable-invoice";

export interface FindManyPayablesOptions {
  supplierId?: string;
  purchaseInvoiceId?: string;
  status?: PayableStatus;
}

export interface PayableInvoiceRepository {
  findById(id: string): Promise<PayableInvoice | null>;
  findByNumber(invoiceNumber: string): Promise<PayableInvoice | null>;
  findMany(options?: FindManyPayablesOptions): Promise<PayableInvoice[]>;
  save(invoice: PayableInvoice): Promise<void>;
  generateNextInvoiceNumber(): Promise<string>;
}
