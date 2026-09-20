import type { BillOfMaterials, BomStatus } from "./bill-of-materials";

export interface FindManyBomsOptions {
  componentId?: string;
  status?: BomStatus;
}

export interface BillOfMaterialsRepository {
  findById(id: string): Promise<BillOfMaterials | null>;
  findActiveByComponentId(componentId: string): Promise<BillOfMaterials | null>;
  findRevisionsByComponentId(componentId: string): Promise<BillOfMaterials[]>;
  findMany(options?: FindManyBomsOptions): Promise<BillOfMaterials[]>;
  /**
   * Ids of BOMs that CONSUME this component — that is, BOMs with a line for it.
   *
   * Distinct from `findMany({ componentId })`, which selects BOMs that *produce*
   * the component. Component consolidation needs the consuming direction, because
   * that is the reference that has to move when a component is retired.
   */
  findBomIdsByLineComponent(componentId: string): Promise<string[]>;
  save(bom: BillOfMaterials): Promise<void>;
  delete(id: string): Promise<void>;
}
