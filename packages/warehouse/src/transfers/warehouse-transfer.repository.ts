import type {
  WarehouseTransfer,
  TransferStatus,
} from "./warehouse-transfer";

export interface FindManyTransfersOptions {
  sourceLocationId?: string;
  destinationLocationId?: string;
  status?: TransferStatus;
  search?: string;
}

export interface WarehouseTransferRepository {
  findById(id: string): Promise<WarehouseTransfer | null>;
  findByTransferNumber(transferNumber: string): Promise<WarehouseTransfer | null>;
  findMany(options?: FindManyTransfersOptions): Promise<WarehouseTransfer[]>;
  save(transfer: WarehouseTransfer): Promise<void>;
  delete(id: string): Promise<void>;
  generateNextTransferNumber(): Promise<string>;
}
