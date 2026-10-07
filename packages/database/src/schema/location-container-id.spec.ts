import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { getTableColumns } from "drizzle-orm";
import { locations } from "./locations";

/**
 * RFC-0069 Phase 1 — `locations.container_id` schema + migration verification.
 *
 * Phase 1 is schema-only: it adds a nullable, self-referencing, indexed
 * `container_id` column and NOTHING else. These tests pin:
 *
 * 1. the Drizzle schema shape (nullable, no default, self-reference, restrict),
 * 2. the additive SQL migration and its journal entry,
 * 3. the live database shape and the Phase 1 guarantee that every existing row
 *    has `container_id IS NULL`,
 * 4. the FK behaviour (dangling reference rejected, restrict on delete) —
 *    exercised in a rolled-back transaction so no data is ever committed.
 *
 * This file intentionally asserts NO application behaviour: no reader, writer,
 * DTO or service consumes `container_id` in Phase 1.
 */
describe("RFC-0069 Phase 1: locations.container_id schema & migration", () => {
  describe("1. Drizzle schema definition", () => {
    it("exposes a nullable containerId with no default", () => {
      const columns = getTableColumns(locations);

      expect(columns.containerId).toBeDefined();
      expect(columns.containerId.name).toBe("container_id");
      expect(columns.containerId.notNull).toBe(false);
      // Phase 1 must not auto-populate: no default of any kind.
      expect(columns.containerId.hasDefault).toBe(false);
    });

    it("keeps parentId and containerId as independent columns", () => {
      const columns = getTableColumns(locations);

      // Both exist and are distinct — neither is derived from the other.
      expect(columns.parentId).toBeDefined();
      expect(columns.containerId).toBeDefined();
      expect(columns.parentId.name).not.toBe(columns.containerId.name);
    });
  });

  describe("2. Migration file & journal consistency", () => {
    const migrationDir = path.resolve(__dirname, "../../drizzle");
    const journalPath = path.join(migrationDir, "meta/_journal.json");
    const migrationSqlPath = path.join(
      migrationDir,
      "0026_lyrical_maestro.sql",
    );

    const readSql = (): string => fs.readFileSync(migrationSqlPath, "utf-8");

    it("adds migration 0026 immediately after 0025 with a matching SQL file", () => {
      expect(fs.existsSync(journalPath)).toBe(true);
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
      const entries = journal.entries as Array<{
        idx: number;
        tag: string;
        when: number;
      }>;

      const head = entries[entries.length - 1]!;
      expect(head.tag).toBe("0026_lyrical_maestro");

      const prev = entries[entries.length - 2]!;
      expect(prev.tag).toBe("0025_add_heartbeat_at");
      expect(head.when).toBeGreaterThan(prev.when);

      expect(fs.existsSync(migrationSqlPath)).toBe(true);
    });

    it("adds a nullable uuid column, a restrictive self-FK and an index", () => {
      const sql = readSql();

      expect(sql).toContain(
        'ALTER TABLE "locations" ADD COLUMN "container_id" uuid;',
      );
      // Nullable: the statement must NOT carry NOT NULL or a DEFAULT.
      expect(sql).not.toMatch(/"container_id"\s+uuid\s+NOT NULL/i);
      expect(sql).not.toMatch(/"container_id"\s+uuid\s+DEFAULT/i);

      expect(sql).toContain(
        'ADD CONSTRAINT "locations_container_id_locations_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."locations"("id") ON DELETE restrict',
      );
      expect(sql).toContain(
        'CREATE INDEX "locations_container_id_idx" ON "locations" USING btree ("container_id");',
      );
    });

    it("is purely additive and does not re-add an already-applied column", () => {
      const sql = readSql();

      // Regression guard: drizzle-kit regenerated a statement for 0025 because
      // that migration has no snapshot. 0026 must contain only the container_id
      // change, never a second ADD COLUMN for another table's column.
      expect(sql).not.toContain('"backup_job_runs"');
      expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE|CONSTRAINT)/i);
      expect(sql).not.toMatch(/UPDATE\s+"?locations"?\s+SET/i);
      expect(sql).not.toMatch(/INSERT\s+INTO/i);
      // Exactly one ADD COLUMN, for container_id.
      const addColumns = sql.match(/ADD COLUMN/g) ?? [];
      expect(addColumns).toHaveLength(1);
    });

    it("serializes the schema snapshot for 0026", () => {
      const snapshotPath = path.join(
        migrationDir,
        "meta/0026_snapshot.json",
      );
      expect(fs.existsSync(snapshotPath)).toBe(true);
      const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
      const columns = snapshot.tables["public.locations"].columns;
      expect(columns.container_id).toBeDefined();
      expect(columns.container_id.notNull).toBe(false);
    });
  });

  describe("3. Live database shape (rolled back, never committed)", () => {
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

    /**
     * Runs `callback` inside a transaction that is ALWAYS rolled back, so these
     * assertions can exercise real DDL/DML constraints without ever committing
     * a row. Mirrors the convention in `spatial-layouts.spec.ts`.
     */
    async function withTx<T>(
      callback: (client: {
        query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      }) => Promise<T>,
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

    it("has a nullable uuid container_id column", async () => {
      await withTx(async (client) => {
        const res = (await client.query(
          `SELECT data_type, is_nullable, column_default
             FROM information_schema.columns
            WHERE table_name = 'locations' AND column_name = 'container_id';`,
        )) as { rows: Array<{ data_type: string; is_nullable: string; column_default: string | null }> };

        expect(res.rows).toHaveLength(1);
        expect(res.rows[0]!.data_type).toBe("uuid");
        expect(res.rows[0]!.is_nullable).toBe("YES");
        expect(res.rows[0]!.column_default).toBeNull();
      });
    });

    it("has the index and a RESTRICT self-referencing foreign key", async () => {
      await withTx(async (client) => {
        const idx = (await client.query(
          `SELECT indexname FROM pg_indexes
            WHERE tablename = 'locations' AND indexname = 'locations_container_id_idx';`,
        )) as { rows: unknown[] };
        expect(idx.rows).toHaveLength(1);

        const fk = (await client.query(
          `SELECT rc.delete_rule
             FROM pg_constraint c
             JOIN information_schema.referential_constraints rc
               ON rc.constraint_name = c.conname
            WHERE c.conname = 'locations_container_id_locations_id_fk';`,
        )) as { rows: Array<{ delete_rule: string }> };
        expect(fk.rows).toHaveLength(1);
        expect(fk.rows[0]!.delete_rule).toBe("RESTRICT");
      });
    });

    it("leaves every existing row unpopulated (Phase 1 guarantee)", async () => {
      await withTx(async (client) => {
        const res = (await client.query(
          `SELECT COUNT(*)::int AS populated FROM locations WHERE container_id IS NOT NULL;`,
        )) as { rows: Array<{ populated: number }> };

        // Phase 1 adds the column and populates nothing.
        expect(res.rows[0]!.populated).toBe(0);
      });
    });

    it("rejects a dangling container reference", async () => {
      await withTx(async (client) => {
        const target = (await client.query(
          `SELECT id FROM locations LIMIT 1;`,
        )) as { rows: Array<{ id: string }> };
        if (target.rows.length === 0) return; // empty DB — nothing to test

        let rejected = false;
        try {
          await client.query(
            `UPDATE locations SET container_id = '00000000-0000-4000-8000-000000000000'
              WHERE id = $1;`,
            [target.rows[0]!.id],
          );
        } catch {
          rejected = true;
        }
        expect(rejected).toBe(true);
      });
    });

    it("restricts deletion of a location that is referenced as a container", async () => {
      await withTx(async (client) => {
        const container = (await client.query(
          `INSERT INTO locations (code, name, kind)
           VALUES ('TEST-CONTAINER-0069', 'Container 0069', 'cabinet')
           RETURNING id;`,
        )) as { rows: Array<{ id: string }> };
        const containerId = container.rows[0]!.id;

        const child = (await client.query(
          `INSERT INTO locations (code, name, kind, container_id)
           VALUES ('TEST-CHILD-0069', 'Child 0069', 'drawer', $1)
           RETURNING id;`,
          [containerId],
        )) as { rows: Array<{ id: string }> };
        expect(child.rows).toHaveLength(1);

        let blocked = false;
        try {
          await client.query(`DELETE FROM locations WHERE id = $1;`, [
            containerId,
          ]);
        } catch {
          blocked = true;
        }
        expect(blocked).toBe(true);
      });
    });

    it("accepts a physically valid container relationship in a rolled-back write", async () => {
      await withTx(async (client) => {
        const container = (await client.query(
          `INSERT INTO locations (code, name, kind)
           VALUES ('TEST-CONT-OK-0069', 'Cabinet 0069', 'cabinet')
           RETURNING id;`,
        )) as { rows: Array<{ id: string }> };
        const containerId = container.rows[0]!.id;

        // Schema-level FK accepts a canonical parent/child pair. Physical
        // CATEGORY validation is a Phase 2 concern and is deliberately not
        // asserted here.
        await client.query(
          `INSERT INTO locations (code, name, kind, container_id)
           VALUES ('TEST-CHILD-OK-0069', 'Drawer 0069', 'drawer', $1);`,
          [containerId],
        );

        const res = (await client.query(
          `SELECT COUNT(*)::int AS n FROM locations
            WHERE container_id = $1;`,
          [containerId],
        )) as { rows: Array<{ n: number }> };
        expect(res.rows[0]!.n).toBe(1);
      });
    });
  });

  describe("4. Persistence round-trip (RFC-0069 Phase 2, rolled back)", () => {
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
      callback: (client: {
        query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
      }) => Promise<T>,
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

    it("round-trips a non-null containerId and reads it back", async () => {
      await withTx(async (client) => {
        const container = (await client.query(
          `INSERT INTO locations (code, name, kind)
           VALUES ('TEST-RT-CONTAINER', 'RT Container', 'cabinet')
           RETURNING id;`,
        )) as { rows: Array<{ id: string }> };

        const inserted = (await client.query(
          `INSERT INTO locations (code, name, kind, container_id)
           VALUES ('TEST-RT-CHILD', 'RT Child', 'drawer', $1)
           RETURNING container_id;`,
          [container.rows[0]!.id],
        )) as { rows: Array<{ container_id: string }> };

        expect(inserted.rows[0]!.container_id).toBe(container.rows[0]!.id);
      });
    });

    it("round-trips a null containerId", async () => {
      await withTx(async (client) => {
        const inserted = (await client.query(
          `INSERT INTO locations (code, name, kind, container_id)
           VALUES ('TEST-RT-NULL', 'RT Null', 'cabinet', NULL)
           RETURNING container_id;`,
        )) as { rows: Array<{ container_id: string | null }> };

        expect(inserted.rows[0]!.container_id).toBeNull();
      });
    });

    it("updates and then clears containerId, keeping parentId independent", async () => {
      await withTx(async (client) => {
        const containerA = (await client.query(
          `INSERT INTO locations (code, name, kind)
           VALUES ('TEST-RT-A', 'A', 'cabinet') RETURNING id;`,
        )) as { rows: Array<{ id: string }> };
        const containerB = (await client.query(
          `INSERT INTO locations (code, name, kind)
           VALUES ('TEST-RT-B', 'B', 'dry_cabinet') RETURNING id;`,
        )) as { rows: Array<{ id: string }> };

        const child = (await client.query(
          `INSERT INTO locations (code, name, kind, parent_id, container_id)
           VALUES ('TEST-RT-CHILD-2', 'Child 2', 'drawer', $1, $2)
           RETURNING id, parent_id, container_id;`,
          [containerA.rows[0]!.id, containerA.rows[0]!.id],
        )) as {
          rows: Array<{ id: string; parent_id: string; container_id: string }>;
        };
        const childId = child.rows[0]!.id;

        // Replace containerId — parentId must be untouched.
        const replaced = (await client.query(
          `UPDATE locations SET container_id = $1 WHERE id = $2
           RETURNING parent_id, container_id;`,
          [containerB.rows[0]!.id, childId],
        )) as { rows: Array<{ parent_id: string; container_id: string }> };
        expect(replaced.rows[0]!.container_id).toBe(containerB.rows[0]!.id);
        expect(replaced.rows[0]!.parent_id).toBe(containerA.rows[0]!.id);

        // Clear containerId — parentId must STILL be untouched.
        const cleared = (await client.query(
          `UPDATE locations SET container_id = NULL WHERE id = $1
           RETURNING parent_id, container_id;`,
          [childId],
        )) as { rows: Array<{ parent_id: string; container_id: string | null }> };
        expect(cleared.rows[0]!.container_id).toBeNull();
        expect(cleared.rows[0]!.parent_id).toBe(containerA.rows[0]!.id);
      });
    });
  });
});
