import type { BillOfMaterials, BomStatus } from "./bill-of-materials";

export interface FindManyBomsOptions {
  componentId?: string;
  status?: BomStatus;
}

export interface BillOfMaterialsRepository {
  findById(id: string): Promise<BillOfMaterials | null>;
  findActiveByComponentId(
    componentId: string,
  ): Promise<BillOfMaterials | null>;
  findMany(options?: FindManyBomsOptions): Promise<BillOfMaterials[]>;
  save(bom: BillOfMaterials): Promise<void>;
}
