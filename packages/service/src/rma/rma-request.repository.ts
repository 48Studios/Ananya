import {
  RmaRequest,
  RmaStatus,
  RmaDisposition,
} from './rma-request';

export interface FindManyRmaRequestsOptions {
  customerId?: string;
  salesOrderId?: string;
  status?: RmaStatus;
  disposition?: RmaDisposition;
  search?: string;
}

export interface RmaRequestRepository {
  findById(id: string): Promise<RmaRequest | null>;
  findByNumber(rmaNumber: string): Promise<RmaRequest | null>;
  findMany(options?: FindManyRmaRequestsOptions): Promise<RmaRequest[]>;
  save(rma: RmaRequest): Promise<void>;
  generateNextRmaNumber(): Promise<string>;
}
