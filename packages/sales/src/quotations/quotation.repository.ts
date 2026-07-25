import { Quotation, QuotationStatus } from './quotation';

export interface FindManyQuotationsOptions {
  customerId?: string;
  status?: QuotationStatus;
}

export interface QuotationRepository {
  findById(id: string): Promise<Quotation | null>;
  findByQuoteNumber(quoteNumber: string): Promise<Quotation | null>;
  findMany(options?: FindManyQuotationsOptions): Promise<Quotation[]>;
  save(quotation: Quotation): Promise<void>;
  generateNextQuoteNumber(): Promise<string>;
}
