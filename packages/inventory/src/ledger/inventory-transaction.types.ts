import type { TransactionType } from "./transaction-types";

export interface CreateInventoryTransactionProps {
  id?: string;
  componentId: string;
  quantity: number;
  unitOfMeasure: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  transactionType: TransactionType;
  reference?: string;
  reason?: string;
  createdBy: string;
  createdAt?: Date;
}

export interface InventoryTransactionProps {
  id: string;
  componentId: string;
  quantity: number;
  unitOfMeasure: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  transactionType: TransactionType;
  reference?: string;
  reason?: string;
  createdBy: string;
  createdAt: Date;
}

export interface FindManyInventoryTransactionsOptions {
  componentId?: string;
  locationId?: string;
  transactionType?: TransactionType;
  reference?: string;
  createdBy?: string;
  search?: string;
}
