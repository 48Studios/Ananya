import {
  ReceivableInvoice,
  InvoiceStatus,
} from './receivable-invoice';

export interface FindManyReceivablesOptions {
  customerId?: string;
  salesOrderId?: string;
  status?: InvoiceStatus;
}

export interface ReceivableInvoiceRepository {
  findById(id: string): Promise<ReceivableInvoice | null>;
  findByNumber(invoiceNumber: string): Promise<ReceivableInvoice | null>;
  findMany(options?: FindManyReceivablesOptions): Promise<ReceivableInvoice[]>;
  save(invoice: ReceivableInvoice): Promise<void>;
  generateNextInvoiceNumber(): Promise<string>;
}
