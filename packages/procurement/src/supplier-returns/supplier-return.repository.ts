import { SupplierReturn } from "./supplier-return";

export interface FindManySupplierReturnsOptions {
  supplierId?: string;
  status?: string;
}

export interface SupplierReturnRepository {
  findById(id: string): Promise<SupplierReturn | null>;
  findByReturnNumber(returnNumber: string): Promise<SupplierReturn | null>;
  findMany(options?: FindManySupplierReturnsOptions): Promise<SupplierReturn[]>;
  save(returnDoc: SupplierReturn): Promise<void>;
  generateNextReturnNumber(): Promise<string>;
  delete(id: string): Promise<void>;
  deleteLine(lineId: string): Promise<void>;
}
