import { Payment, PaymentType, PaymentStatus } from "./payment";

export interface FindManyPaymentsOptions {
  paymentType?: PaymentType;
  bankAccountId?: string;
  status?: PaymentStatus;
}

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByNumber(paymentNumber: string): Promise<Payment | null>;
  findMany(options?: FindManyPaymentsOptions): Promise<Payment[]>;
  save(payment: Payment): Promise<void>;
  generateNextPaymentNumber(): Promise<string>;
}
