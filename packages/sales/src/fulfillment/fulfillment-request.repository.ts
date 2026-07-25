import {
  FulfillmentRequest,
  FulfillmentStatus,
} from './fulfillment-request';

export interface FindManyFulfillmentRequestsOptions {
  salesOrderId?: string;
  warehouseId?: string;
  status?: FulfillmentStatus;
}

export interface FulfillmentRequestRepository {
  findById(id: string): Promise<FulfillmentRequest | null>;
  findByRequestNumber(requestNumber: string): Promise<FulfillmentRequest | null>;
  findMany(
    options?: FindManyFulfillmentRequestsOptions,
  ): Promise<FulfillmentRequest[]>;
  save(request: FulfillmentRequest): Promise<void>;
  generateNextRequestNumber(): Promise<string>;
}
