import { Location } from "./location";

export interface FindManyLocationsOptions {}

export interface LocationRepository {
  findById(id: string): Promise<Location | null>;
  findByCode(code: string): Promise<Location | null>;
  findByParentId(parentId: string): Promise<Location[]>;
  findMany(options?: FindManyLocationsOptions): Promise<Location[]>;
  save(location: Location): Promise<Location>;
  update(location: Location): Promise<Location>;
  delete(id: string): Promise<void>;
}
