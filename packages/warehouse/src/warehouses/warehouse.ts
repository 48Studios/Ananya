import { ObjectId } from "@ananya/core";
import {
  InvalidWarehouseCodeError,
  InvalidBinCapacityError,
} from "./warehouse.errors";

export type BinPurpose =
  | "RECEIVING"
  | "STORAGE"
  | "PRODUCTION"
  | "SHIPPING"
  | "QUALITY_HOLD";

export interface WarehouseBinProps {
  id: string;
  warehouseId: string;
  code: string;
  capacity: number;
  currentUtilization: number;
  purpose: BinPurpose;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseProps {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  bins?: WarehouseBinProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  description?: string | null;
}

export interface AddBinInput {
  code: string;
  capacity?: number;
  purpose?: BinPurpose;
}

export class Warehouse {
  public readonly id: string;
  public readonly code: string;
  public name: string;
  public description?: string | null;
  public status: string;
  public readonly bins: WarehouseBinProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: WarehouseProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.bins = props.bins ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateWarehouseInput): Warehouse {
    const code = input.code.trim().toUpperCase();
    if (!code) {
      throw new InvalidWarehouseCodeError("Warehouse code is required.");
    }

    const id = ObjectId.generate().value;
    const now = new Date();

    return new Warehouse({
      id,
      code,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      status: "ACTIVE",
      bins: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public addBin(input: AddBinInput): WarehouseBinProps {
    const code = input.code.trim().toUpperCase();
    const capacity = input.capacity ?? 1000;

    if (capacity < 0) {
      throw new InvalidBinCapacityError("Bin capacity must be non-negative.");
    }

    const binId = ObjectId.generate().value;
    const now = new Date();

    const bin: WarehouseBinProps = {
      id: binId,
      warehouseId: this.id,
      code,
      capacity,
      currentUtilization: 0,
      purpose: input.purpose ?? "STORAGE",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.bins.push(bin);
    this.updatedAt = now;
    return bin;
  }

  public toggleBinState(binId: string, isActive: boolean): void {
    const bin = this.bins.find((b) => b.id === binId);
    if (bin) {
      bin.isActive = isActive;
      bin.updatedAt = new Date();
      this.updatedAt = new Date();
    }
  }

  public updateBinCapacity(binId: string, capacity: number): void {
    if (capacity < 0) {
      throw new InvalidBinCapacityError("Bin capacity must be non-negative.");
    }
    const bin = this.bins.find((b) => b.id === binId);
    if (bin) {
      bin.capacity = capacity;
      bin.updatedAt = new Date();
      this.updatedAt = new Date();
    }
  }

  public static rehydrate(props: WarehouseProps): Warehouse {
    return new Warehouse(props);
  }
}
