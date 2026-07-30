import type { SeededRng } from "../helpers/rng";

export interface LocationNode {
  key: string;
  code: string;
  name: string;
  kind: string;
  parentKey?: string;
  metadata?: Record<string, unknown>;
}

const WAREHOUSE_LOCATION_ROOTS = [
  { key: "loc-main", code: "MAIN", name: "Main Warehouse", kind: "warehouse" },
  { key: "loc-lab", code: "LAB", name: "Electronics Lab", kind: "warehouse" },
  { key: "loc-work", code: "WORK", name: "Workshop", kind: "warehouse" },
  { key: "loc-insp", code: "INSP", name: "Incoming Inspection", kind: "warehouse" },
] as const;

const RACKS = ["A", "B", "C", "D"] as const;
const SHELVES = [1, 2, 3, 4] as const;
const DRAWERS = ["A1", "A2", "B1", "B2", "C1", "C2", "D1", "D2"] as const;
const BINS = ["01", "02", "03", "04", "05", "06"] as const;

export function buildLocationTree(): LocationNode[] {
  const nodes: LocationNode[] = [];

  for (const root of WAREHOUSE_LOCATION_ROOTS) {
    nodes.push({ ...root });

    for (const rack of RACKS) {
      const rackKey = `${root.key}:rack-${rack}`;
      nodes.push({
        key: rackKey,
        code: `${root.code}-R${rack}`,
        name: `Rack ${rack}`,
        kind: "rack",
        parentKey: root.key,
      });

      for (const shelf of SHELVES) {
        const shelfKey = `${rackKey}:shelf-${shelf}`;
        nodes.push({
          key: shelfKey,
          code: `${root.code}-R${rack}-S${shelf}`,
          name: `Shelf ${shelf}`,
          kind: "shelf",
          parentKey: rackKey,
        });

        for (const drawer of DRAWERS) {
          const drawerKey = `${shelfKey}:drawer-${drawer}`;
          nodes.push({
            key: drawerKey,
            code: `${root.code}-R${rack}-S${shelf}-D${drawer}`,
            name: `Drawer ${drawer}`,
            kind: "drawer",
            parentKey: shelfKey,
          });

          for (const bin of BINS) {
            nodes.push({
              key: `${drawerKey}:bin-${bin}`,
              code: `${root.code}-R${rack}-S${shelf}-D${drawer}-B${bin}`,
              name: `Bin ${bin}`,
              kind: "bin",
              parentKey: drawerKey,
              metadata: { warehouseCode: root.code, rack, shelf, drawer, bin },
            });
          }
        }
      }
    }
  }

  return nodes;
}

export function pickStorageLocationKeys(rng: SeededRng): string[] {
  const binKeys = buildLocationTree()
    .filter((node) => node.kind === "bin")
    .map((node) => node.key);

  return rng.shuffle(binKeys);
}

export function defaultReceivingLocationKey(): string {
  return "loc-insp:rack-A:shelf-1:drawer-A1:bin-01";
}

export function defaultLabLocationKey(): string {
  return "loc-lab:rack-A:shelf-1:drawer-A1:bin-01";
}

export function defaultWorkshopLocationKey(): string {
  return "loc-work:rack-A:shelf-1:drawer-A1:bin-01";
}
