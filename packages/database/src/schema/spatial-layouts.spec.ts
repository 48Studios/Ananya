import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { getTableColumns } from "drizzle-orm";
import {
  spatialLayouts,
  spatialLayoutMappings,
  spatialLayoutRevisions,
} from "./spatial";

describe("Phase 3.1: Spatial Layouts Schema & Migration Specification", () => {
  describe("1. Drizzle Schema Definitions & Column Invariants", () => {
    it("defines spatial_layouts with RFC-specified columns, defaults, and types", () => {
      const columns = getTableColumns(spatialLayouts);

      expect(columns.id).toBeDefined();
      expect(columns.parentLocationId).toBeDefined();
      expect(columns.parentLocationId.notNull).toBe(true);

      expect(columns.code).toBeDefined();
      expect(columns.code.notNull).toBe(true);

      expect(columns.name).toBeDefined();
      expect(columns.name.notNull).toBe(true);

      expect(columns.description).toBeDefined();
      expect(columns.description.notNull).toBe(false);

      expect(columns.templateType).toBeDefined();
      expect(columns.templateType.notNull).toBe(true);

      expect(columns.engineVersion).toBeDefined();
      expect(columns.engineVersion.notNull).toBe(true);
      expect(columns.engineVersion.default).toBe("1.0.0");

      expect(columns.config).toBeDefined();
      expect(columns.config.notNull).toBe(true);

      expect(columns.revision).toBeDefined();
      expect(columns.revision.notNull).toBe(true);
      expect(columns.revision.default).toBe(1);

      expect(columns.status).toBeDefined();
      expect(columns.status.notNull).toBe(true);
      expect(columns.status.default).toBe("PUBLISHED");

      expect(columns.totalCompartments).toBeDefined();
      expect(columns.totalCompartments.notNull).toBe(true);
      expect(columns.totalCompartments.default).toBe(0);

      expect(columns.metadata).toBeDefined();
      expect(columns.metadata.notNull).toBe(true);

      expect(columns.createdBy).toBeDefined();
      expect(columns.createdBy.notNull).toBe(false);

      expect(columns.updatedBy).toBeDefined();
      expect(columns.updatedBy.notNull).toBe(false);

      expect(columns.createdAt).toBeDefined();
      expect(columns.createdAt.notNull).toBe(true);

      expect(columns.updatedAt).toBeDefined();
      expect(columns.updatedAt.notNull).toBe(true);
    });

    it("defines spatial_layout_mappings with RFC-specified columns and defaults", () => {
      const columns = getTableColumns(spatialLayoutMappings);

      expect(columns.id).toBeDefined();

      expect(columns.layoutId).toBeDefined();
      expect(columns.layoutId.notNull).toBe(true);

      expect(columns.slotId).toBeDefined();
      expect(columns.slotId.notNull).toBe(true);

      expect(columns.slotCode).toBeDefined();
      expect(columns.slotCode.notNull).toBe(true);

      expect(columns.locationId).toBeDefined();
      expect(columns.locationId.notNull).toBe(true);

      expect(columns.logicalRow).toBeDefined();
      expect(columns.logicalRow.notNull).toBe(true);

      expect(columns.logicalCol).toBeDefined();
      expect(columns.logicalCol.notNull).toBe(true);

      expect(columns.isStale).toBeDefined();
      expect(columns.isStale.notNull).toBe(true);
      expect(columns.isStale.default).toBe(false);

      expect(columns.staleReason).toBeDefined();
      expect(columns.staleReason.notNull).toBe(false);

      expect(columns.acknowledgedChangeSignature).toBeDefined();
      expect(columns.acknowledgedChangeSignature.notNull).toBe(false);

      expect(columns.mappedAt).toBeDefined();
      expect(columns.mappedAt.notNull).toBe(true);

      expect(columns.updatedAt).toBeDefined();
      expect(columns.updatedAt.notNull).toBe(true);
    });

    it("defines spatial_layout_revisions with RFC-specified snapshot and diff fields", () => {
      const columns = getTableColumns(spatialLayoutRevisions);

      expect(columns.id).toBeDefined();

      expect(columns.layoutId).toBeDefined();
      expect(columns.layoutId.notNull).toBe(true);

      expect(columns.revisionNumber).toBeDefined();
      expect(columns.revisionNumber.notNull).toBe(true);

      expect(columns.configSnapshot).toBeDefined();
      expect(columns.configSnapshot.notNull).toBe(true);

      expect(columns.mappingsSnapshot).toBeDefined();
      expect(columns.mappingsSnapshot.notNull).toBe(true);

      expect(columns.diffSummary).toBeDefined();
      expect(columns.diffSummary.notNull).toBe(true);

      expect(columns.changeDescription).toBeDefined();
      expect(columns.changeDescription.notNull).toBe(false);

      expect(columns.authorId).toBeDefined();
      expect(columns.authorId.notNull).toBe(false);

      expect(columns.createdAt).toBeDefined();
      expect(columns.createdAt.notNull).toBe(true);
    });
  });

  describe("2. Migration File & Journal Consistency", () => {
    const migrationDir = path.resolve(__dirname, "../../drizzle");
    const migrationSqlPath = path.join(migrationDir, "0020_spatial_layouts.sql");
    const journalPath = path.join(migrationDir, "meta/_journal.json");

    it("ensures migration sequence 0020_spatial_layouts immediately follows 0019_safe_ikaris", () => {
      expect(fs.existsSync(journalPath)).toBe(true);
      const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
      const entries = journal.entries;

      expect(entries.length).toBeGreaterThanOrEqual(21);
      const prevEntry = entries[19];
      const newEntry = entries[20];

      expect(prevEntry.idx).toBe(19);
      expect(prevEntry.tag).toBe("0019_safe_ikaris");

      expect(newEntry.idx).toBe(20);
      expect(newEntry.tag).toBe("0020_spatial_layouts");
    });

    it("verifies 0020_spatial_layouts.sql contains all required DDL and constraint clauses", () => {
      expect(fs.existsSync(migrationSqlPath)).toBe(true);
      const sqlContent = fs.readFileSync(migrationSqlPath, "utf-8");

      // Verify table creation
      expect(sqlContent).toContain('CREATE TABLE "spatial_layouts"');
      expect(sqlContent).toContain('CREATE TABLE "spatial_layout_mappings"');
      expect(sqlContent).toContain('CREATE TABLE "spatial_layout_revisions"');

      // Verify Foreign Key & Deletion Semantics
      // 1. Parent location: ON DELETE restrict
      expect(sqlContent).toMatch(
        /ALTER TABLE "spatial_layouts" ADD CONSTRAINT "spatial_layouts_parent_location_id_locations_id_fk" FOREIGN KEY \("parent_location_id"\) REFERENCES "public"\."locations"\("id"\) ON DELETE restrict/,
      );

      // 2. Mappings layout: ON DELETE cascade
      expect(sqlContent).toMatch(
        /ALTER TABLE "spatial_layout_mappings" ADD CONSTRAINT "spatial_layout_mappings_layout_id_spatial_layouts_id_fk" FOREIGN KEY \("layout_id"\) REFERENCES "public"\."spatial_layouts"\("id"\) ON DELETE cascade/,
      );

      // 3. Mappings location: ON DELETE restrict (PROTECT active warehouse locations from silent deletion)
      expect(sqlContent).toMatch(
        /ALTER TABLE "spatial_layout_mappings" ADD CONSTRAINT "spatial_layout_mappings_location_id_locations_id_fk" FOREIGN KEY \("location_id"\) REFERENCES "public"\."locations"\("id"\) ON DELETE restrict/,
      );

      // 4. Revisions layout: ON DELETE cascade
      expect(sqlContent).toMatch(
        /ALTER TABLE "spatial_layout_revisions" ADD CONSTRAINT "spatial_layout_revisions_layout_id_spatial_layouts_id_fk" FOREIGN KEY \("layout_id"\) REFERENCES "public"\."spatial_layouts"\("id"\) ON DELETE cascade/,
      );

      // 5. Revisions author: ON DELETE set null
      expect(sqlContent).toMatch(
        /ALTER TABLE "spatial_layout_revisions" ADD CONSTRAINT "spatial_layout_revisions_author_id_users_id_fk" FOREIGN KEY \("author_id"\) REFERENCES "public"\."users"\("id"\) ON DELETE set null/,
      );

      // Verify Unique Constraints & Indexes
      // 1. Unique slot per layout
      expect(sqlContent).toContain(
        'CREATE UNIQUE INDEX "spatial_layout_mappings_layout_slot_unique" ON "spatial_layout_mappings" USING btree ("layout_id","slot_id");',
      );

      // 2. Unique location per layout
      expect(sqlContent).toContain(
        'CREATE UNIQUE INDEX "spatial_layout_mappings_layout_location_unique" ON "spatial_layout_mappings" USING btree ("layout_id","location_id");',
      );

      // 3. Unique layout revision number per layout
      expect(sqlContent).toContain(
        'CREATE UNIQUE INDEX "spatial_layout_revisions_layout_rev_unique" ON "spatial_layout_revisions" USING btree ("layout_id","revision_number");',
      );

      // 4. Unique code
      expect(sqlContent).toContain(
        'CREATE UNIQUE INDEX "spatial_layouts_code_unique" ON "spatial_layouts" USING btree ("code");',
      );

      // 5. Partial unique index for published layouts per container
      expect(sqlContent).toContain(
        'CREATE UNIQUE INDEX "spatial_layouts_active_parent_unique" ON "spatial_layouts" USING btree ("parent_location_id") WHERE status = \'PUBLISHED\';',
      );
    });
  });

  describe("3. Database Referential Integrity & Constraint Enforcement (PostgreSQL)", () => {
    let pool: Pool;
    const testRunId = Math.floor(Math.random() * 1000000);

    beforeAll(() => {
      const connectionString =
        process.env.DATABASE_URL ||
        "postgresql://ananya:dTd1Ii43r9Q9@localhost:5432/ananya";
      pool = new Pool({ connectionString });
    });

    afterAll(async () => {
      await pool.end();
    });

    async function withTx<T>(callback: (client: any) => Promise<T>): Promise<T> {
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

    it("enforces restrictive deletion on parent container (cannot delete parent location if spatial layout references it)", async () => {
      await withTx(async (client) => {
        // Create parent location
        const locRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-${testRunId}', 'Test Parent Container', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = locRes.rows[0].id;

        // Create spatial layout referencing parent location
        await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES (
            $1, 'LAYOUT-${testRunId}-A', 'Cabinet Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{"rows": 5}', 'PUBLISHED'
          );
        `, [parentLocationId]);

        // Attempting to delete the parent location MUST fail with 23503 foreign key violation
        let errorCaught: any = null;
        try {
          await client.query(`DELETE FROM locations WHERE id = $1;`, [parentLocationId]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23503");
        expect(errorCaught.constraint).toBe("spatial_layouts_parent_location_id_locations_id_fk");
      });
    });

    it("enforces restrictive deletion on mapped location (cannot delete location if spatial_layout_mappings references it)", async () => {
      await withTx(async (client) => {
        // Create parent container and child mapped location
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-M-${testRunId}', 'Test Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const mRes = await client.query(`
          INSERT INTO locations (code, name, kind, parent_id)
          VALUES ('TEST-SLOT-LOC-${testRunId}', 'Slot Location', 'BIN', $1)
          RETURNING id;
        `, [parentLocationId]);
        const mappedLocationId = mRes.rows[0].id;

        // Create spatial layout
        const lRes = await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES (
            $1, 'LAYOUT-MAP-${testRunId}', 'Cabinet Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{"rows": 5}', 'PUBLISHED'
          ) RETURNING id;
        `, [parentLocationId]);
        const layoutId = lRes.rows[0].id;

        // Create mapping
        await client.query(`
          INSERT INTO spatial_layout_mappings (
            layout_id, slot_id, slot_code, location_id, logical_row, logical_col
          ) VALUES (
            $1, 'slot_r0_c0', 'A01', $2, 0, 0
          );
        `, [layoutId, mappedLocationId]);

        // Attempting to delete the mapped location MUST fail with 23503 foreign key violation
        let errorCaught: any = null;
        try {
          await client.query(`DELETE FROM locations WHERE id = $1;`, [mappedLocationId]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23503");
        expect(errorCaught.constraint).toBe("spatial_layout_mappings_location_id_locations_id_fk");
      });
    });

    it("cascades deletion from spatial_layouts to mappings and revisions", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-CASCADE-${testRunId}', 'Test Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const mRes = await client.query(`
          INSERT INTO locations (code, name, kind, parent_id)
          VALUES ('TEST-SLOT-CASC-${testRunId}', 'Slot Location', 'BIN', $1)
          RETURNING id;
        `, [parentLocationId]);
        const mappedLocationId = mRes.rows[0].id;

        const lRes = await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES (
            $1, 'LAYOUT-CASCADE-${testRunId}', 'Cabinet Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{"rows": 5}', 'PUBLISHED'
          ) RETURNING id;
        `, [parentLocationId]);
        const layoutId = lRes.rows[0].id;

        await client.query(`
          INSERT INTO spatial_layout_mappings (
            layout_id, slot_id, slot_code, location_id, logical_row, logical_col
          ) VALUES (
            $1, 'slot_0', 'A01', $2, 0, 0
          );
        `, [layoutId, mappedLocationId]);

        await client.query(`
          INSERT INTO spatial_layout_revisions (
            layout_id, revision_number, config_snapshot, mappings_snapshot, diff_summary
          ) VALUES (
            $1, 1, '{"rows": 5}', '[]', '{"type": "INITIAL"}'
          );
        `, [layoutId]);

        // Delete the layout
        await client.query(`DELETE FROM spatial_layouts WHERE id = $1;`, [layoutId]);

        // Check mappings and revisions are gone
        const mapCheck = await client.query(
          `SELECT COUNT(*)::int as count FROM spatial_layout_mappings WHERE layout_id = $1;`,
          [layoutId],
        );
        expect(mapCheck.rows[0].count).toBe(0);

        const revCheck = await client.query(
          `SELECT COUNT(*)::int as count FROM spatial_layout_revisions WHERE layout_id = $1;`,
          [layoutId],
        );
        expect(revCheck.rows[0].count).toBe(0);

        // However, the location itself MUST STILL EXIST (not deleted!)
        const locCheck = await client.query(
          `SELECT COUNT(*)::int as count FROM locations WHERE id = $1;`,
          [mappedLocationId],
        );
        expect(locCheck.rows[0].count).toBe(1);
      });
    });

    it("rejects duplicate slot mapping in the same layout", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-DUP1-${testRunId}', 'Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const loc1 = (await client.query(`
          INSERT INTO locations (code, name, kind, parent_id)
          VALUES ('TEST-LOC-1-${testRunId}', 'L1', 'BIN', $1) RETURNING id;
        `, [parentLocationId])).rows[0].id;

        const loc2 = (await client.query(`
          INSERT INTO locations (code, name, kind, parent_id)
          VALUES ('TEST-LOC-2-${testRunId}', 'L2', 'BIN', $1) RETURNING id;
        `, [parentLocationId])).rows[0].id;

        const layoutId = (await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-DUP1-${testRunId}', 'Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED')
          RETURNING id;
        `, [parentLocationId])).rows[0].id;

        // First mapping to slot 'slot_A'
        await client.query(`
          INSERT INTO spatial_layout_mappings (layout_id, slot_id, slot_code, location_id, logical_row, logical_col)
          VALUES ($1, 'slot_A', 'A01', $2, 0, 0);
        `, [layoutId, loc1]);

        // Attempting to assign a second location to the same slot 'slot_A' in the same layout
        let errorCaught: any = null;
        try {
          await client.query(`
            INSERT INTO spatial_layout_mappings (layout_id, slot_id, slot_code, location_id, logical_row, logical_col)
            VALUES ($1, 'slot_A', 'A01', $2, 0, 0);
          `, [layoutId, loc2]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23505");
        expect(errorCaught.constraint).toBe("spatial_layout_mappings_layout_slot_unique");
      });
    });

    it("rejects duplicate location mapping in the same layout", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-DUP2-${testRunId}', 'Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const loc1 = (await client.query(`
          INSERT INTO locations (code, name, kind, parent_id)
          VALUES ('TEST-LOC-DUP-${testRunId}', 'L1', 'BIN', $1) RETURNING id;
        `, [parentLocationId])).rows[0].id;

        const layoutId = (await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-DUP2-${testRunId}', 'Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED')
          RETURNING id;
        `, [parentLocationId])).rows[0].id;

        // First mapping location loc1 to slot 'slot_A'
        await client.query(`
          INSERT INTO spatial_layout_mappings (layout_id, slot_id, slot_code, location_id, logical_row, logical_col)
          VALUES ($1, 'slot_A', 'A01', $2, 0, 0);
        `, [layoutId, loc1]);

        // Attempting to assign the SAME location loc1 to slot 'slot_B' in the same layout
        let errorCaught: any = null;
        try {
          await client.query(`
            INSERT INTO spatial_layout_mappings (layout_id, slot_id, slot_code, location_id, logical_row, logical_col)
            VALUES ($1, 'slot_B', 'A02', $2, 0, 1);
          `, [layoutId, loc1]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23505");
        expect(errorCaught.constraint).toBe("spatial_layout_mappings_layout_location_unique");
      });
    });

    it("enforces partial unique index: at most one PUBLISHED layout per parent location", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-PARTIAL-${testRunId}', 'Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        // Insert first PUBLISHED layout
        await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-PUB1-${testRunId}', 'Pub 1', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED');
        `, [parentLocationId]);

        // Multiple DRAFT layouts are permitted
        await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-DRAFT1-${testRunId}', 'Draft 1', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'DRAFT');
        `, [parentLocationId]);
        await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-DRAFT2-${testRunId}', 'Draft 2', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'DRAFT');
        `, [parentLocationId]);

        // Inserting a second PUBLISHED layout for the same parent container MUST fail
        let errorCaught: any = null;
        try {
          await client.query(`
            INSERT INTO spatial_layouts (
              parent_location_id, code, name, template_type, engine_version, config, status
            ) VALUES ($1, 'LAYOUT-PUB2-${testRunId}', 'Pub 2', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED');
          `, [parentLocationId]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23505");
        expect(errorCaught.constraint).toBe("spatial_layouts_active_parent_unique");
      });
    });

    it("enforces revision number uniqueness per layout", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-REV-${testRunId}', 'Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const layoutId = (await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-REV-${testRunId}', 'Rev Test Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED')
          RETURNING id;
        `, [parentLocationId])).rows[0].id;

        // Insert revision 1
        await client.query(`
          INSERT INTO spatial_layout_revisions (
            layout_id, revision_number, config_snapshot, mappings_snapshot, diff_summary
          ) VALUES ($1, 1, '{"rows": 5}', '[]', '{"type": "INIT"}');
        `, [layoutId]);

        // Insert revision 2 (allowed)
        await client.query(`
          INSERT INTO spatial_layout_revisions (
            layout_id, revision_number, config_snapshot, mappings_snapshot, diff_summary
          ) VALUES ($1, 2, '{"rows": 6}', '[]', '{"type": "RESIZE"}');
        `, [layoutId]);

        // Duplicate revision 1 for the same layout MUST fail
        let errorCaught: any = null;
        try {
          await client.query(`
            INSERT INTO spatial_layout_revisions (
              layout_id, revision_number, config_snapshot, mappings_snapshot, diff_summary
            ) VALUES ($1, 1, '{"rows": 5}', '[]', '{"type": "DUP"}');
          `, [layoutId]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23505");
        expect(errorCaught.constraint).toBe("spatial_layout_revisions_layout_rev_unique");
      });
    });

    it("rejects invalid parent container references (nonexistent UUID)", async () => {
      await withTx(async (client) => {
        const fakeParentId = "00000000-0000-0000-0000-000000000999";
        let errorCaught: any = null;
        try {
          await client.query(`
            INSERT INTO spatial_layouts (
              parent_location_id, code, name, template_type, engine_version, config, status
            ) VALUES ($1, 'LAYOUT-INVALID-PARENT-${testRunId}', 'Invalid Parent Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED');
          `, [fakeParentId]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23503");
        expect(errorCaught.constraint).toBe("spatial_layouts_parent_location_id_locations_id_fk");
      });
    });

    it("rejects invalid mapped location references (nonexistent UUID)", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-INV-MAP-${testRunId}', 'Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const layoutId = (await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-INV-MAP-${testRunId}', 'Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{}', 'PUBLISHED')
          RETURNING id;
        `, [parentLocationId])).rows[0].id;

        const fakeLocationId = "00000000-0000-0000-0000-000000000888";
        let errorCaught: any = null;
        try {
          await client.query(`
            INSERT INTO spatial_layout_mappings (
              layout_id, slot_id, slot_code, location_id, logical_row, logical_col
            ) VALUES ($1, 'slot_x', 'X01', $2, 0, 0);
          `, [layoutId, fakeLocationId]);
        } catch (err: any) {
          errorCaught = err;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.code).toBe("23503");
        expect(errorCaught.constraint).toBe("spatial_layout_mappings_location_id_locations_id_fk");
      });
    });

    it("retains historical snapshot in revisions independently of live mapping row mutations", async () => {
      await withTx(async (client) => {
        const pRes = await client.query(`
          INSERT INTO locations (code, name, kind)
          VALUES ('TEST-PARENT-HIST-${testRunId}', 'Parent', 'CABINET')
          RETURNING id;
        `);
        const parentLocationId = pRes.rows[0].id;

        const locA = (await client.query(`
          INSERT INTO locations (code, name, kind, parent_id)
          VALUES ('TEST-LOC-HIST-A-${testRunId}', 'Loc A', 'BIN', $1) RETURNING id;
        `, [parentLocationId])).rows[0].id;

        const layoutId = (await client.query(`
          INSERT INTO spatial_layouts (
            parent_location_id, code, name, template_type, engine_version, config, status
          ) VALUES ($1, 'LAYOUT-HIST-${testRunId}', 'Hist Layout', 'SMD_DRAWER_CABINET', '1.0.0', '{"rows": 2}', 'PUBLISHED')
          RETURNING id;
        `, [parentLocationId])).rows[0].id;

        // Create live mapping
        const mapId = (await client.query(`
          INSERT INTO spatial_layout_mappings (layout_id, slot_id, slot_code, location_id, logical_row, logical_col)
          VALUES ($1, 'slot_0', 'A01', $2, 0, 0) RETURNING id;
        `, [layoutId, locA])).rows[0].id;

        // Create revision 1 snapshotting locA
        const snapshotData = [
          {
            slotId: "slot_0",
            slotCode: "A01",
            locationId: locA,
            locationCode: `TEST-LOC-HIST-A-${testRunId}`,
            isStale: false,
          },
        ];

        await client.query(`
          INSERT INTO spatial_layout_revisions (
            layout_id, revision_number, config_snapshot, mappings_snapshot, diff_summary
          ) VALUES ($1, 1, '{"rows": 2}', $2, '{"type": "INITIAL"}');
        `, [layoutId, JSON.stringify(snapshotData)]);

        // Now modify/delete live mapping row
        await client.query(`DELETE FROM spatial_layout_mappings WHERE id = $1;`, [mapId]);

        // Live mappings table is now empty
        const liveRes = await client.query(
          `SELECT COUNT(*)::int as count FROM spatial_layout_mappings WHERE layout_id = $1;`,
          [layoutId],
        );
        expect(liveRes.rows[0].count).toBe(0);

        // Historical revision snapshot STILL contains the full mapping and config data
        const revRes = await client.query(
          `SELECT mappings_snapshot, config_snapshot FROM spatial_layout_revisions WHERE layout_id = $1 AND revision_number = 1;`,
          [layoutId],
        );
        expect(revRes.rows.length).toBe(1);
        expect(revRes.rows[0].mappings_snapshot).toEqual(snapshotData);
        expect(revRes.rows[0].config_snapshot).toEqual({ rows: 2 });
      });
    });
  });
});
