import type { Pool } from "pg";

/**
 * Demo dataset identifiers used by the spatial browser suites.
 *
 * The seed utility creates locations/models/layouts with server-generated
 * UUIDs (deterministic by code, not by id), so specs must resolve ids from the
 * database instead of hardcoding values that only exist in one seeded instance.
 */
export const DEMO_CODES = {
  warehouse: "DEMO-SPATIAL-WAREHOUSE",
  cabinetA: "DEMO-SPATIAL-CABINET-A",
  cabinetB: "DEMO-SPATIAL-CABINET-B",
  cabinetC: "DEMO-SPATIAL-CABINET-C",
  openBins: "DEMO-SPATIAL-OPEN-BINS",
  rack: "DEMO-SPATIAL-RACK",
  tray: "DEMO-SPATIAL-TRAY",
  shelf: "DEMO-SPATIAL-SHELF",
  drawerA01: "DEMO-SPATIAL-DRAWER-A01",
  drawerB01: "DEMO-SPATIAL-DRAWER-B01",
  drawerC01: "DEMO-SPATIAL-DRAWER-C01",
  drawerD01: "DEMO-SPATIAL-DRAWER-D01",
  binA0101: "DEMO-SPATIAL-BIN-A01-01",
  binA0102: "DEMO-SPATIAL-BIN-A01-02",
  openBinB01: "DEMO-SPATIAL-BIN-OB-B01",
  rackL1B1: "DEMO-SPATIAL-RACK-L1B1",
  shelfL2: "DEMO-SPATIAL-SHELF-L2",
  modelCabinetA: "DEMO-SPATIAL-MODEL-CABINET-A",
  modelDrawerDeep: "DEMO-SPATIAL-MODEL-DRAWER-DEEP",
  layoutCabinetA: "DEMO-SPATIAL-LAYOUT-CAB-A",
  layoutCabinetC: "DEMO-SPATIAL-LAYOUT-CAB-C",
  layoutTray: "DEMO-SPATIAL-LAYOUT-TRAY",
} as const;

async function resolveId(pool: Pool, sql: string, code: string): Promise<string> {
  const result = await pool.query<{ id: string }>(sql, [code]);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(
      `Demo seed record '${code}' not found. Run 'pnpm seed:spatial' before the browser suite.`,
    );
  }
  return id;
}

/** Resolves one demo location id by its seeded code. */
export function resolveDemoLocationId(
  pool: Pool,
  code: string,
): Promise<string> {
  return resolveId(pool, "SELECT id FROM locations WHERE code = $1;", code);
}

/** Resolves one demo spatial model id by its seeded code. */
export function resolveDemoModelId(pool: Pool, code: string): Promise<string> {
  return resolveId(pool, "SELECT id FROM spatial_models WHERE code = $1;", code);
}

/** Resolves one demo layout id by its seeded code. */
export function resolveDemoLayoutId(
  pool: Pool,
  code: string,
): Promise<string> {
  return resolveId(pool, "SELECT id FROM spatial_layouts WHERE code = $1;", code);
}

/** Resolves every demo location id referenced by a spec in one round trip. */
export async function resolveDemoLocationIds(
  pool: Pool,
  codes: readonly string[],
): Promise<Record<string, string>> {
  const result = await pool.query<{ id: string; code: string }>(
    "SELECT id, code FROM locations WHERE code = ANY($1::text[]);",
    [codes],
  );
  const byCode = new Map(result.rows.map((row) => [row.code, row.id]));
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const code of codes) {
    const id = byCode.get(code);
    if (!id) {
      missing.push(code);
      continue;
    }
    resolved[code] = id;
  }
  if (missing.length > 0) {
    throw new Error(
      `Demo seed records not found: ${missing.join(", ")}. Run 'pnpm seed:spatial' before the browser suite.`,
    );
  }
  return resolved;
}
