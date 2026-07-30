import type { ProductDefinition } from "./fixtures/products";

export interface SeedContext {
  ids: {
    category: Map<string, string>;
    manufacturer: Map<string, string>;
    supplier: Map<string, string>;
    unit: Map<string, string>;
    warehouse: Map<string, string>;
    warehouseZone: Map<string, string>;
    warehouseBin: Map<string, string>;
    location: Map<string, string>;
    component: Map<string, string>;
    project: Map<string, string>;
    purchaseOrder: Map<string, string>;
    poLine: Map<string, string>;
    goodsReceipt: Map<string, string>;
    stockAdjustment: Map<string, string>;
    warehouseTransfer: Map<string, string>;
    cycleCount: Map<string, string>;
    stockCount: Map<string, string>;
    reservation: Map<string, string>;
  };
  products: ProductDefinition[];
  productLocation: Map<string, string>;
  productStock: Map<string, number>;
  productCost: Map<string, number>;
}

export function createSeedContext(products: ProductDefinition[]): SeedContext {
  return {
    ids: {
      category: new Map(),
      manufacturer: new Map(),
      supplier: new Map(),
      unit: new Map(),
      warehouse: new Map(),
      warehouseZone: new Map(),
      warehouseBin: new Map(),
      location: new Map(),
      component: new Map(),
      project: new Map(),
      purchaseOrder: new Map(),
      poLine: new Map(),
      goodsReceipt: new Map(),
      stockAdjustment: new Map(),
      warehouseTransfer: new Map(),
      cycleCount: new Map(),
      stockCount: new Map(),
      reservation: new Map(),
    },
    products,
    productLocation: new Map(),
    productStock: new Map(),
    productCost: new Map(),
  };
}

export function ctxId(
  ctx: SeedContext,
  bucket: keyof SeedContext["ids"],
  key: string,
): string {
  const id = ctx.ids[bucket].get(key);
  if (!id) {
    throw new Error(`Missing seeded id for ${bucket}:${key}`);
  }
  return id;
}
