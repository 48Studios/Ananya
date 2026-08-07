import { apiClient } from "../api-client";

export interface LedgerAccountDto {
  id: string;
  accountNumber: string;
  name: string;
  accountType: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  parentAccountId?: string | null;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivableInvoiceDto {
  id: string;
  invoiceNumber: string;
  customerId: string;
  salesOrderId: string;
  dueDate: string;
  amount: number;
  balance: number;
  status: "DRAFT" | "POSTED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface PayableInvoiceDto {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  purchaseInvoiceId: string;
  dueDate: string;
  amount: number;
  balance: number;
  status: "DRAFT" | "POSTED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDto {
  id: string;
  paymentNumber: string;
  paymentType:
    | "CUSTOMER_PAYMENT"
    | "SUPPLIER_PAYMENT"
    | "INTERNAL_TRANSFER"
    | "REFUND";
  paymentMethod: "WIRE_TRANSFER" | "CHECK" | "CREDIT_CARD" | "CASH" | "ACH";
  amount: number;
  reference?: string | null;
  bankAccountId?: string | null;
  status: "DRAFT" | "POSTED" | "RECONCILED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface BankAccountSummaryDto {
  id: string;
  accountName: string;
  bankName: string;
  accountNumberMasked: string;
  currency: string;
  isActive: boolean;
  latestStatementBalance: number | null;
  latestStatementDate: string | null;
  latestReconciliationStatus: string | null;
}

export interface BankReconciliationTransactionDto {
  id: string;
  bankReconciliationId: string;
  transactionDate: string;
  description: string;
  amount: number;
  matchedPaymentId?: string | null;
  isMatched: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankReconciliationDto {
  id: string;
  bankAccountId: string;
  statementDate: string;
  openingBalance: number;
  closingBalance: number;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  transactions: BankReconciliationTransactionDto[];
  createdAt: string;
  updatedAt: string;
}

export const financeApi = {
  getAccounts: (): Promise<LedgerAccountDto[]> =>
    apiClient.get<LedgerAccountDto[]>("/accounts"),
  getReceivableInvoices: (): Promise<ReceivableInvoiceDto[]> =>
    apiClient.get<ReceivableInvoiceDto[]>("/receivable-invoices"),
  getPayableInvoices: (): Promise<PayableInvoiceDto[]> =>
    apiClient.get<PayableInvoiceDto[]>("/payable-invoices"),
  getPayments: (): Promise<PaymentDto[]> =>
    apiClient.get<PaymentDto[]>("/payments"),
  getBankAccounts: (): Promise<BankAccountSummaryDto[]> =>
    apiClient.get<BankAccountSummaryDto[]>("/bank-accounts"),
  getBankReconciliations: (): Promise<BankReconciliationDto[]> =>
    apiClient.get<BankReconciliationDto[]>("/bank-reconciliations"),
};
