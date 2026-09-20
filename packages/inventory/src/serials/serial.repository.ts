import type { Serial } from "./serial";

export interface SerialRepository {
  findById(id: string): Promise<Serial | null>;
  findBySerialNumber(
    componentId: string,
    serialNumber: string,
  ): Promise<Serial | null>;
  findManyByComponent(componentId: string): Promise<Serial[]>;
  save(serial: Serial): Promise<Serial>;
  /**
   * Persists a serial that already exists, used when its owning component
   * changes during consolidation. `save` cannot be used for this because it
   * inserts a new row.
   */
  update(serial: Serial): Promise<Serial>;
}
