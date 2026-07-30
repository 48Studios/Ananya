import { Manufacturer } from "./manufacturer";

export interface FindManyManufacturersOptions {}

export interface ManufacturerRepository {
  findById(id: string): Promise<Manufacturer | null>;
  findByCode(code: string): Promise<Manufacturer | null>;
  findMany(options?: FindManyManufacturersOptions): Promise<Manufacturer[]>;
  save(manufacturer: Manufacturer): Promise<Manufacturer>;
  update(manufacturer: Manufacturer): Promise<Manufacturer>;
  delete(id: string): Promise<void>;
  hasComponents(id: string): Promise<boolean>;
}
