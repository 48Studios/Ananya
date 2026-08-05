import { SalesOrder, SalesOrderStatus } from "./sales-order";

export interface FindManySalesOrdersOptions {
  customerId?: string;
  status?: SalesOrderStatus;
}

export interface SalesOrderRepository {
  findById(id: string): Promise<SalesOrder | null>;
  findByOrderNumber(orderNumber: string): Promise<SalesOrder | null>;
  findMany(options?: FindManySalesOrdersOptions): Promise<SalesOrder[]>;
  save(salesOrder: SalesOrder): Promise<void>;
  generateNextOrderNumber(): Promise<string>;
}
