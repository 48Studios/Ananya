import type {
  WarehouseTransfer,
  TransferStatus,
} from "./warehouse-transfer";

export interface FindManyTransfersOptions {
  sourceBinId?: string;
  destinationBinId?: string;
  status?: TransferStatus;
}

export interface WarehouseTransferRepository {
  findById(id: string): Promise<WarehouseTransfer | null>;
  findMany(
    options?: FindManyTransfersOptions,
  ): Promise<WarehouseTransfer[]>;
  save(transfer: WarehouseTransfer): Promise<void>;
  generateNextTransferNumber(): Promise<string>;
}
