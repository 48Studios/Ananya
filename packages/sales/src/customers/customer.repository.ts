import { Customer, CustomerStatus } from './customer';

export interface FindManyCustomersOptions {
  status?: CustomerStatus;
  search?: string;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByNumber(customerNumber: string): Promise<Customer | null>;
  findMany(options?: FindManyCustomersOptions): Promise<Customer[]>;
  save(customer: Customer): Promise<void>;
  generateNextCustomerNumber(): Promise<string>;
}
