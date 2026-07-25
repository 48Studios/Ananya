import { ObjectId } from "@ananya/core";

export interface WarehousePolicyProps {
  id: string;
  warehouseId: string;
  allowNegativeInventory: boolean;
  enforceBinCapacity: boolean;
  directedPutaway: boolean;
  directedPicking: boolean;
  defaultReceivingBinId?: string | null;
  defaultProductionBinId?: string | null;
  defaultShippingBinId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehousePolicyInput {
  warehouseId: string;
  allowNegativeInventory?: boolean;
  enforceBinCapacity?: boolean;
  directedPutaway?: boolean;
  directedPicking?: boolean;
  defaultReceivingBinId?: string | null;
  defaultProductionBinId?: string | null;
  defaultShippingBinId?: string | null;
}

export class WarehousePolicy {
  public readonly id: string;
  public readonly warehouseId: string;
  public allowNegativeInventory: boolean;
  public enforceBinCapacity: boolean;
  public directedPutaway: boolean;
  public directedPicking: boolean;
  public defaultReceivingBinId?: string | null;
  public defaultProductionBinId?: string | null;
  public defaultShippingBinId?: string | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: WarehousePolicyProps) {
    this.id = props.id;
    this.warehouseId = props.warehouseId;
    this.allowNegativeInventory = props.allowNegativeInventory;
    this.enforceBinCapacity = props.enforceBinCapacity;
    this.directedPutaway = props.directedPutaway;
    this.directedPicking = props.directedPicking;
    this.defaultReceivingBinId = props.defaultReceivingBinId;
    this.defaultProductionBinId = props.defaultProductionBinId;
    this.defaultShippingBinId = props.defaultShippingBinId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateWarehousePolicyInput): WarehousePolicy {
    const id = ObjectId.generate().value;
    const now = new Date();

    return new WarehousePolicy({
      id,
      warehouseId: input.warehouseId,
      allowNegativeInventory: input.allowNegativeInventory ?? false,
      enforceBinCapacity: input.enforceBinCapacity ?? true,
      directedPutaway: input.directedPutaway ?? false,
      directedPicking: input.directedPicking ?? false,
      defaultReceivingBinId: input.defaultReceivingBinId ?? null,
      defaultProductionBinId: input.defaultProductionBinId ?? null,
      defaultShippingBinId: input.defaultShippingBinId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public updateRules(input: Partial<CreateWarehousePolicyInput>): void {
    if (input.allowNegativeInventory !== undefined) {
      this.allowNegativeInventory = input.allowNegativeInventory;
    }
    if (input.enforceBinCapacity !== undefined) {
      this.enforceBinCapacity = input.enforceBinCapacity;
    }
    if (input.directedPutaway !== undefined) {
      this.directedPutaway = input.directedPutaway;
    }
    if (input.directedPicking !== undefined) {
      this.directedPicking = input.directedPicking;
    }
    if (input.defaultReceivingBinId !== undefined) {
      this.defaultReceivingBinId = input.defaultReceivingBinId;
    }
    if (input.defaultProductionBinId !== undefined) {
      this.defaultProductionBinId = input.defaultProductionBinId;
    }
    if (input.defaultShippingBinId !== undefined) {
      this.defaultShippingBinId = input.defaultShippingBinId;
    }
    this.updatedAt = new Date();
  }

  public static rehydrate(props: WarehousePolicyProps): WarehousePolicy {
    return new WarehousePolicy(props);
  }
}
