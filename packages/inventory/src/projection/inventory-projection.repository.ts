import { InventoryProjection } from "./inventory-projection";

export interface InventoryProjectionRepository {
  findById(id: string): Promise<InventoryProjection | null>;
  findByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<InventoryProjection | null>;
  findManyByComponent(componentId: string): Promise<InventoryProjection[]>;
  findManyByLocation(locationId: string): Promise<InventoryProjection[]>;
  findManyByLocations(locationIds: string[]): Promise<InventoryProjection[]>;
  save(projection: InventoryProjection): Promise<InventoryProjection>;
  delete(id: string): Promise<void>;
  deleteByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<void>;
}
