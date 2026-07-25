import { CustomerReturn, ReturnStatus } from './customer-return';

export interface FindManyCustomerReturnsOptions {
  customerId?: string;
  salesOrderId?: string;
  status?: ReturnStatus;
}

export interface CustomerReturnRepository {
  findById(id: string): Promise<CustomerReturn | null>;
  findByReturnNumber(returnNumber: string): Promise<CustomerReturn | null>;
  findMany(
    options?: FindManyCustomerReturnsOptions,
  ): Promise<CustomerReturn[]>;
  save(customerReturn: CustomerReturn): Promise<void>;
  generateNextReturnNumber(): Promise<string>;
}
