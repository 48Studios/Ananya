import { Component } from "./component";
import type { FindManyComponentsOptions } from "./component";

export interface ComponentRepository {
  findById(id: string): Promise<Component | null>;
  findBySku(sku: string): Promise<Component | null>;
  findMany(options?: FindManyComponentsOptions): Promise<Component[]>;
  save(component: Component): Promise<Component>;
  update(component: Component): Promise<Component>;
  delete(id: string): Promise<void>;
}
