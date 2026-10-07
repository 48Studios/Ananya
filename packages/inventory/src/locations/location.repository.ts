import { Location } from "./location";

export interface FindManyLocationsOptions {}

export interface LocationRepository {
  findById(id: string): Promise<Location | null>;
  findByCode(code: string): Promise<Location | null>;
  findByParentId(parentId: string): Promise<Location[]>;
  /**
   * Walks the ORGANIZATIONAL `parentId` chain upward from `id` and returns the
   * ids of every ancestor (immediate parent first), stopping when a repeated id
   * is seen so a pre-existing cycle cannot cause an unbounded loop. Used for
   * `parentId` cycle detection only.
   */
  findAncestorIds(id: string): Promise<string[]>;
  /**
   * Walks the PHYSICAL `containerId` chain upward from `id` and returns the ids
   * of every container ancestor (immediate container first), stopping when a
   * repeated id is seen so malformed pre-existing data cannot loop forever.
   *
   * Deliberately separate from {@link findAncestorIds}: organizational and
   * physical containment are independent graphs and must never be conflated.
   */
  findContainerAncestorIds(id: string): Promise<string[]>;
  findMany(options?: FindManyLocationsOptions): Promise<Location[]>;
  save(location: Location): Promise<Location>;
  update(location: Location): Promise<Location>;
  delete(id: string): Promise<void>;
  isInUse(id: string): Promise<boolean>;
}
