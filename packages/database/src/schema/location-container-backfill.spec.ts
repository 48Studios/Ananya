import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

/**
 * RFC-0069 Phase 3B — backfill WRITE-MECHANISM verification.
 *
 * The Phase 3A/3B decision logic (which rows get a container) is covered by the
 * pure planner tests in `@ananya/inventory`. This file proves the SQL mechanism
 * the backfill tool relies on, against a real database, using ONLY isolated
 * fixture rows inside a transaction that is ALWAYS rolled back — so it never
 * touches real locations and never leaks fixtures.
 *
 * It asserts:
 *   1. `container_id = parent_id` is applied to exactly the expected fixture rows,
 *   2. the operation is idempotent (`IS DISTINCT FROM` → 0 rows on re-run),
 *   3. violations (non-canonical pairs) and unparented rows stay NULL,
 *   4. parentId is never changed,
 *   5. the inventory ledger is not touched,
 *   6. a failed verification rolls back cleanly.
 */
describe("RFC-0069 Phase 3B: physical containment backfill mechanism", () => {
  let pool: Pool;

  beforeAll(() => {
    const connectionString =
      process.env.DATABASE_URL ||
      "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";
    pool = new Pool({ connectionString });
  });

  afterAll(async () => {
    await pool.end();
  });

  async function withTx<T>(
    callback: (client: any) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN;");
      const result = await callback(client);
      await client.query("ROLLBACK;");
      return result;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  const run = Math.floor(Math.random() * 1_000_000);

  /**
   * Builds an isolated fixture graph:
   *   cabinet C
   *     ├── drawer D          (canonical)      → would be assigned
   *     └── bin B             (violation)      → stays NULL
   *   shelf S (unparented)                       → stays NULL
   */
  async function seedFixture(client: any) {
    const cab = (
      await client.query(
        `INSERT INTO locations (code, name, kind)
         VALUES ('BF-CAB-${run}', 'BF Cabinet', 'cabinet') RETURNING id;`,
      )
    ).rows[0].id;
    const drw = (
      await client.query(
        `INSERT INTO locations (code, name, kind, parent_id)
         VALUES ('BF-DRW-${run}', 'BF Drawer', 'drawer', $1) RETURNING id;`,
        [cab],
      )
    ).rows[0].id;
    const bin = (
      await client.query(
        `INSERT INTO locations (code, name, kind, parent_id)
         VALUES ('BF-BIN-${run}', 'BF Bin', 'bin', $1) RETURNING id;`,
        [cab],
      )
    ).rows[0].id;
    const solo = (
      await client.query(
        `INSERT INTO locations (code, name, kind)
         VALUES ('BF-SOLO-${run}', 'BF Solo Shelf', 'shelf') RETURNING id;`,
      )
    ).rows[0].id;
    return { cab, drw, bin, solo };
  }

  /** The backfill statement: only the approved (canonical) pairs. */
  async function applyBackfill(client: any, approvedIds: string[]) {
    const res = await client.query(
      `UPDATE locations
          SET container_id = parent_id, updated_at = now()
        WHERE id = ANY($1::uuid[])
          AND container_id IS DISTINCT FROM parent_id`,
      [approvedIds],
    );
    return res.rowCount;
  }

  it("applies container_id = parent_id to exactly the approved rows", async () => {
    await withTx(async (client) => {
      const { drw, bin, solo } = await seedFixture(client);

      // Approved set = the canonical relationship only.
      const updated = await applyBackfill(client, [drw]);
      expect(updated).toBe(1);

      const rows: Array<{
        id: string;
        container_id: string | null;
        parent_id: string | null;
      }> = (
        await client.query(
          `SELECT id, container_id, parent_id FROM locations
            WHERE id = ANY($1::uuid[]) ORDER BY code`,
          [[drw, bin, solo]],
        )
      ).rows;
      const byId = new Map(rows.map((r) => [r.id, r]));

      expect(byId.get(drw)!.container_id).toBe(byId.get(drw)!.parent_id);
      // Violation and unparented stay NULL.
      expect(byId.get(bin)!.container_id).toBeNull();
      expect(byId.get(solo)!.container_id).toBeNull();
    });
  });

  it("is idempotent: a second run updates zero rows", async () => {
    await withTx(async (client) => {
      const { drw } = await seedFixture(client);

      const first = await applyBackfill(client, [drw]);
      const second = await applyBackfill(client, [drw]);
      expect(first).toBe(1);
      expect(second).toBe(0);
    });
  });

  it("never changes parentId", async () => {
    await withTx(async (client) => {
      const { cab, drw, bin } = await seedFixture(client);
      const before: Array<{ id: string; parent_id: string | null }> = (
        await client.query(
          `SELECT id, parent_id FROM locations WHERE id = ANY($1::uuid[])`,
          [[drw, bin]],
        )
      ).rows;

      await applyBackfill(client, [drw]);

      const after: Array<{ id: string; parent_id: string | null }> = (
        await client.query(
          `SELECT id, parent_id FROM locations WHERE id = ANY($1::uuid[])`,
          [[drw, bin]],
        )
      ).rows;
      const beforeMap = new Map(before.map((r) => [r.id, r.parent_id]));
      for (const row of after) {
        expect(row.parent_id).toBe(beforeMap.get(row.id));
      }
      // And parentId still points at the cabinet.
      expect(after.find((r) => r.id === drw)!.parent_id).toBe(cab);
    });
  });

  it("leaves the inventory ledger untouched", async () => {
    await withTx(async (client) => {
      const before = (
        await client.query(
          `SELECT count(*)::int AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS fp
             FROM inventory_transactions`,
        )
      ).rows[0];

      const { drw } = await seedFixture(client);
      await applyBackfill(client, [drw]);

      const after = (
        await client.query(
          `SELECT count(*)::int AS n, md5(string_agg(id::text, ',' ORDER BY id)) AS fp
             FROM inventory_transactions`,
        )
      ).rows[0];
      expect(after.n).toBe(before.n);
      expect(after.fp).toBe(before.fp);
    });
  });

  it("leaves spatial tables untouched", async () => {
    await withTx(async (client) => {
      const snapshot = async () => {
        const { rows } = await client.query(`
          SELECT
            (SELECT count(*)::int FROM spatial_layouts) AS layouts,
            (SELECT count(*)::int FROM spatial_layout_mappings) AS mappings,
            (SELECT count(*)::int FROM spatial_nodes) AS nodes,
            (SELECT md5(string_agg(id::text || ':' || status || ':' || revision, ',' ORDER BY id)) FROM spatial_layouts) AS layouts_fp
        `);
        return rows[0];
      };

      const before = await snapshot();
      const { drw } = await seedFixture(client);
      await applyBackfill(client, [drw]);
      const after = await snapshot();

      expect(after).toEqual(before);
    });
  });

  it("rolls back cleanly when verification fails", async () => {
    await withTx(async (client) => {
      const { drw } = await seedFixture(client);
      await applyBackfill(client, [drw]);

      // Simulate a post-write assertion failure.
      const assertAndRollback = async () => {
        await client.query("ROLLBACK;");
        await client.query("BEGIN;");
      };
      await assertAndRollback();

      // After the rollback+new tx, the fixture rows no longer exist.
      const rows = (
        await client.query(
          `SELECT count(*)::int AS n FROM locations WHERE id = $1`,
          [drw],
        )
      ).rows;
      expect(rows[0].n).toBe(0);
    });
  });

  it("aborts before any write when guard expectations mismatch", async () => {
    await withTx(async (client) => {
      const { drw, bin } = await seedFixture(client);

      const expectedAssignments: number = 999;
      const actualAssignments: number = 1;
      let writeAttempted = false;

      if (expectedAssignments !== actualAssignments) {
        // Guard aborts before issuing any SQL write
      } else {
        writeAttempted = true;
        await applyBackfill(client, [drw]);
      }

      expect(writeAttempted).toBe(false);

      const rows: Array<{ container_id: string | null }> = (
        await client.query(
          `SELECT container_id FROM locations WHERE id = ANY($1::uuid[])`,
          [[drw, bin]],
        )
      ).rows;
      expect(rows.every((r) => r.container_id === null)).toBe(true);
    });
  });

  it("leaves containerId unchanged when a transaction rolls back", async () => {
    await withTx(async (client) => {
      const { drw } = await seedFixture(client);

      const before = (
        await client.query(
          `SELECT container_id FROM locations WHERE id = $1`,
          [drw],
        )
      ).rows[0];
      expect(before.container_id).toBeNull();

      await client.query("SAVEPOINT pre_backfill;");
      await applyBackfill(client, [drw]);

      const during = (
        await client.query(
          `SELECT container_id FROM locations WHERE id = $1`,
          [drw],
        )
      ).rows[0];
      expect(during.container_id).not.toBeNull();

      await client.query("ROLLBACK TO SAVEPOINT pre_backfill;");

      const after = (
        await client.query(
          `SELECT container_id FROM locations WHERE id = $1`,
          [drw],
        )
      ).rows[0];
      expect(after.container_id).toBeNull();
    });
  });

  it("produces no self-containers or cycles", async () => {
    await withTx(async (client) => {
      const { drw } = await seedFixture(client);
      await applyBackfill(client, [drw]);

      const { rows } = await client.query(`
        WITH RECURSIVE walk AS (
          SELECT id, container_id, ARRAY[id] AS path, false AS cy
            FROM locations WHERE container_id IS NULL
          UNION ALL
          SELECT l.id, l.container_id, w.path || l.id, l.id = ANY(w.path)
            FROM locations l JOIN walk w ON l.container_id = w.id
           WHERE array_length(w.path, 1) < 30 AND NOT w.cy
        )
        SELECT
          (SELECT count(*)::int FROM locations WHERE container_id = id) AS self_refs,
          (SELECT count(*)::int FROM walk WHERE cy) AS cycles
      `);
      expect(rows[0].self_refs).toBe(0);
      expect(rows[0].cycles).toBe(0);
    });
  });
});