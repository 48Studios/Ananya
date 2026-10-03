import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { getDb, closeDatabaseConnection } from '@ananya/database';
import {
  locations,
  spatialLayouts,
  spatialLayoutMappings,
  spatialLayoutRevisions,
  spatialNodes,
} from '@ananya/database/schema';
import { eq, inArray } from '@ananya/database/query';
import { SpatialLayoutService } from '../../src/spatial/spatial-layout.service';
import { DrizzleSpatialLayoutRepository } from '../../src/infrastructure/repositories/drizzle-spatial-layout.repository';
import { DrizzleLocationRepository } from '../../src/infrastructure/repositories/drizzle-location.repository';
import { DrizzleSpatialNodeRepository } from '../../src/infrastructure/repositories/drizzle-spatial.repository';
import {
  ParentCannotBeSlotError,
  IncompatibleLocationKindError,
  DuplicateLocationMappingError,
  DuplicateSlotMappingError,
  SpatialLayoutRevisionConflictError,
  SpatialNodeOwnershipConflictError,
  InactiveLocationMappingError,
  ConcurrentHierarchyMutationError,
  PublishedLayoutAlreadyExistsError,
  CannotDeleteNonDraftLayoutError,
  CannotModifyArchivedLayoutError,
  MalformedSupersededGeometryError,
} from '@ananya/inventory';

describe('Spatial Layout Persistence & Publication Integration', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  let db: ReturnType<typeof getDb>;
  let layoutService: SpatialLayoutService;

  const testRunId = Math.random().toString(36).slice(2, 8);
  const createdLocationIds: string[] = [];
  const createdLayoutIds: string[] = [];

  let parentLocationId: string;
  let childLoc1Id: string;
  let childLoc2Id: string;
  let childLoc3Id: string;
  let inactiveLocId: string;
  let unrelatedParentId: string;
  let unrelatedChildId: string;
  let warehouseLocId: string;
  let testLayoutId: string;

  /**
   * Engine-shaped SMD drawer cabinet configuration.
   *
   * `ParametricStorageConfig` requires a nested `dimensions` object plus
   * `templateType` and `wallThicknessMm`; a flat dimension object is rejected
   * by `validateParametricConfig`.
   */
  const smdConfig = (
    widthMm: number,
    rows: number,
    columns: number,
    heightMm = 1200,
    depthMm = 450,
  ) => ({
    templateType: 'SMD_DRAWER_CABINET' as const,
    dimensions: { widthMm, heightMm, depthMm },
    wallThicknessMm: 15,
    rows,
    columns,
  });

  /**
   * Creates an isolated cabinet + drawer location pair for tests that publish
   * layouts. Isolating the parent keeps the "one PUBLISHED layout per parent"
   * invariant from masking the behaviour under test.
   */
  const createContainerPair = async (tag: string) => {
    const [parent] = await db
      .insert(locations)
      .values({
        code: `CAB-${tag}-${testRunId}`,
        name: `Cabinet ${tag} ${testRunId}`,
        kind: 'cabinet',
        isActive: true,
      })
      .returning();
    if (!parent) throw new Error(`Failed to create ${tag} parent location`);

    const [child] = await db
      .insert(locations)
      .values({
        code: `DRW-${tag}-${testRunId}`,
        name: `Drawer ${tag} ${testRunId}`,
        kind: 'drawer',
        parentId: parent.id,
        isActive: true,
      })
      .returning();
    if (!child) throw new Error(`Failed to create ${tag} child location`);

    createdLocationIds.push(parent.id, child.id);
    return { parentId: parent.id, childId: child.id, childCode: child.code };
  };

  beforeAll(async () => {
    if (!hasDbUrl) return;

    db = getDb();
    layoutService = new SpatialLayoutService(
      new DrizzleSpatialLayoutRepository(db),
      new DrizzleLocationRepository(),
      new DrizzleSpatialNodeRepository(db),
    );

    // 1. Seed Parent Location (Cabinet)
    const [parent] = await db
      .insert(locations)
      .values({
        code: `CAB-${testRunId}`,
        name: `Test Cabinet ${testRunId}`,
        kind: 'cabinet',
        isActive: true,
      })
      .returning();
    if (!parent) throw new Error('Failed to create parent location');
    parentLocationId = parent.id;
    createdLocationIds.push(parent.id);

    // 2. Seed Child Compartment Locations
    const [c1, c2, c3] = await db
      .insert(locations)
      .values([
        {
          code: `DRW-1-${testRunId}`,
          name: `Drawer 1 ${testRunId}`,
          kind: 'drawer',
          parentId: parentLocationId,
          isActive: true,
        },
        {
          code: `DRW-2-${testRunId}`,
          name: `Drawer 2 ${testRunId}`,
          kind: 'drawer',
          parentId: parentLocationId,
          isActive: true,
        },
        {
          code: `DRW-3-${testRunId}`,
          name: `Drawer 3 ${testRunId}`,
          kind: 'drawer',
          parentId: parentLocationId,
          isActive: true,
        },
      ])
      .returning();
    if (!c1 || !c2 || !c3) throw new Error('Failed to create child locations');
    childLoc1Id = c1.id;
    childLoc2Id = c2.id;
    childLoc3Id = c3.id;
    createdLocationIds.push(c1.id, c2.id, c3.id);

    // 3. Seed Inactive Location
    const [inactive] = await db
      .insert(locations)
      .values({
        code: `INACT-${testRunId}`,
        name: `Inactive Drawer ${testRunId}`,
        kind: 'drawer',
        parentId: parentLocationId,
        isActive: false,
      })
      .returning();
    if (!inactive) throw new Error('Failed to create inactive location');
    inactiveLocId = inactive.id;
    createdLocationIds.push(inactive.id);

    // 4. Seed Incompatible Macro Location (Warehouse)
    const [wh] = await db
      .insert(locations)
      .values({
        code: `WH-${testRunId}`,
        name: `Main Warehouse ${testRunId}`,
        kind: 'warehouse',
        parentId: parentLocationId,
        isActive: true,
      })
      .returning();
    if (!wh) throw new Error('Failed to create warehouse location');
    warehouseLocId = wh.id;
    createdLocationIds.push(wh.id);

    // 5. Seed Unrelated Parent & Child (Foreign hierarchy)
    const [unrelatedP] = await db
      .insert(locations)
      .values({
        code: `UNREL-CAB-${testRunId}`,
        name: `Unrelated Cabinet ${testRunId}`,
        kind: 'cabinet',
        isActive: true,
      })
      .returning();
    if (!unrelatedP) throw new Error('Failed to create unrelated parent');
    unrelatedParentId = unrelatedP.id;
    createdLocationIds.push(unrelatedP.id);

    const [unrelatedC] = await db
      .insert(locations)
      .values({
        code: `UNREL-DRW-${testRunId}`,
        name: `Unrelated Drawer ${testRunId}`,
        kind: 'drawer',
        parentId: unrelatedParentId,
        isActive: true,
      })
      .returning();
    if (!unrelatedC) throw new Error('Failed to create unrelated child');
    unrelatedChildId = unrelatedC.id;
    createdLocationIds.push(unrelatedC.id);
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Clean up created layouts and their mappings/revisions/nodes
    for (const layoutId of createdLayoutIds) {
      await db
        .delete(spatialNodes)
        .where(
          inArray(spatialNodes.locationId, [
            childLoc1Id,
            childLoc2Id,
            childLoc3Id,
          ]),
        );
      await db
        .delete(spatialLayoutRevisions)
        .where(eq(spatialLayoutRevisions.layoutId, layoutId));
      await db
        .delete(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, layoutId));
      await db.delete(spatialLayouts).where(eq(spatialLayouts.id, layoutId));
    }

    // Clean up locations (children before parents)
    if (createdLocationIds.length > 0) {
      await db
        .delete(spatialNodes)
        .where(inArray(spatialNodes.locationId, createdLocationIds));
      // Delete children first
      const children = [
        childLoc1Id,
        childLoc2Id,
        childLoc3Id,
        inactiveLocId,
        warehouseLocId,
        unrelatedChildId,
      ];
      await db.delete(locations).where(inArray(locations.id, children));
      const parents = [parentLocationId, unrelatedParentId];
      await db.delete(locations).where(inArray(locations.id, parents));
    }

    await closeDatabaseConnection();
  });

  describe('1. Draft Creation & Explicit DRAFT Default', () => {
    it('creates a new layout explicitly in DRAFT status regardless of database default', async () => {
      if (!hasDbUrl) return;

      const created = await layoutService.createLayout({
        code: `LAYOUT-DRAFT-${testRunId}`,
        name: 'Draft Storage Layout',
        parentLocationId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 3, 3),
      });

      createdLayoutIds.push(created.id);

      expect(created.id).toBeDefined();
      expect(created.status).toBe('DRAFT');
      expect(created.revision).toBe(1);
      expect(created.totalCompartments).toBe(9); // 3x3
      expect(created.mappings).toHaveLength(0);

      // Verify directly from DB row
      const [row] = await db
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, created.id));
      expect(row?.status).toBe('DRAFT');
    });
  });

  describe('2. Mapping Invariants & Transactional Validation', () => {
    it('rejects mapping the parent container itself as an internal slot', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.createLayout({
          code: `LAYOUT-SELF-${testRunId}`,
          name: 'Self Mapping Layout',
          parentLocationId,
          templateType: 'SMD_DRAWER_CABINET',
          config: smdConfig(1000, 2, 2),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: parentLocationId,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ParentCannotBeSlotError);
    });

    it('rejects mapping an incompatible macro location (warehouse)', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.createLayout({
          code: `LAYOUT-MACRO-${testRunId}`,
          name: 'Macro Mapping Layout',
          parentLocationId,
          templateType: 'SMD_DRAWER_CABINET',
          config: smdConfig(1000, 2, 2),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: warehouseLocId,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(IncompatibleLocationKindError);
    });

    it('rejects duplicate slot mapping in single layout', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.createLayout({
          code: `LAYOUT-DUPSLOT-${testRunId}`,
          name: 'Duplicate Slot Layout',
          parentLocationId,
          templateType: 'SMD_DRAWER_CABINET',
          config: smdConfig(1000, 2, 2),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: childLoc1Id,
            },
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: childLoc2Id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(DuplicateSlotMappingError);
    });

    it('rejects duplicate location mapping in single layout', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.createLayout({
          code: `LAYOUT-DUPLOC-${testRunId}`,
          name: 'Duplicate Location Layout',
          parentLocationId,
          templateType: 'SMD_DRAWER_CABINET',
          config: smdConfig(1000, 2, 2),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: childLoc1Id,
            },
            {
              slotId: 'drawer_slot_r0_c1',
              slotCode: 'R0-C1',
              locationId: childLoc1Id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(DuplicateLocationMappingError);
    });

    it('rejects inactive location mapping', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.createLayout({
          code: `LAYOUT-INACT-${testRunId}`,
          name: 'Inactive Location Layout',
          parentLocationId,
          templateType: 'SMD_DRAWER_CABINET',
          config: smdConfig(1000, 2, 2),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: inactiveLocId,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(InactiveLocationMappingError);
    });

    it('rejects foreign location from unrelated parent hierarchy', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.createLayout({
          code: `LAYOUT-FOREIGN-${testRunId}`,
          name: 'Foreign Hierarchy Layout',
          parentLocationId,
          templateType: 'SMD_DRAWER_CABINET',
          config: smdConfig(1000, 2, 2),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'R0-C0',
              locationId: unrelatedChildId,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ConcurrentHierarchyMutationError);
    });
  });

  describe('3. Concurrency, Revision History & Publication', () => {
    it('creates draft layout with valid mappings', async () => {
      if (!hasDbUrl) return;

      const created = await layoutService.createLayout({
        code: `LAYOUT-PROD-${testRunId}`,
        name: 'Production Cabinet Layout',
        parentLocationId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: childLoc1Id,
          },
          {
            slotId: 'drawer_slot_r0_c1',
            slotCode: 'R0-C1',
            locationId: childLoc2Id,
          },
        ],
      });

      testLayoutId = created.id;
      createdLayoutIds.push(testLayoutId);

      expect(created.revision).toBe(1);
      expect(created.mappings).toHaveLength(2);
    });

    it('rejects update with stale expectedRevision (HTTP 409 conflict)', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.updateLayout(testLayoutId, {
          expectedRevision: 999, // Stale!
          changeDescription: 'Concurrent write',
        }),
      ).rejects.toBeInstanceOf(SpatialLayoutRevisionConflictError);
    });

    it('updates layout configuration and mappings atomically, recording immutable revision snapshot', async () => {
      if (!hasDbUrl) return;

      const updated = await layoutService.updateLayout(testLayoutId, {
        expectedRevision: 1,
        config: smdConfig(1100, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: childLoc1Id,
          },
          {
            slotId: 'drawer_slot_r0_c1',
            slotCode: 'R0-C1',
            locationId: childLoc2Id,
          },
          {
            slotId: 'drawer_slot_r1_c0',
            slotCode: 'R1-C0',
            locationId: childLoc3Id,
          },
        ],
        changeDescription: 'Added 3rd drawer mapping',
      });

      expect(updated.revision).toBe(2);
      expect(updated.mappings).toHaveLength(3);

      // Verify revision snapshot was appended
      const revisions = await layoutService.getRevisions(testLayoutId);
      expect(revisions.length).toBeGreaterThanOrEqual(1);
      const rev1 = revisions.find((r) => r.revisionNumber === 1);
      expect(rev1).toBeDefined();
      expect(rev1?.changeDescription).toBe('Added 3rd drawer mapping');

      // Snapshot must record the PHYSICAL location code, never the slot code
      const rev1BySlot = new Map(
        (rev1?.mappingsSnapshot ?? []).map((m) => [m.slotId, m]),
      );
      expect(rev1BySlot.size).toBe(2);
      expect(rev1BySlot.get('drawer_slot_r0_c0')?.locationCode).toBe(
        `DRW-1-${testRunId}`,
      );
      expect(rev1BySlot.get('drawer_slot_r0_c1')?.locationCode).toBe(
        `DRW-2-${testRunId}`,
      );
      for (const snap of rev1BySlot.values()) {
        expect(snap.locationCode).not.toBe(snap.slotCode);
      }
    });

    it('publishes layout explicitly, incrementing revision and synchronizing spatial_nodes', async () => {
      if (!hasDbUrl) return;

      const published = await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 2,
        changeDescription: 'First publication to production floor',
      });

      expect(published.status).toBe('PUBLISHED');
      expect(published.revision).toBe(3);

      // Check spatial_nodes were created for all 3 mapped locations
      const nodes = await db
        .select()
        .from(spatialNodes)
        .where(
          inArray(spatialNodes.locationId, [
            childLoc1Id,
            childLoc2Id,
            childLoc3Id,
          ]),
        );

      expect(nodes).toHaveLength(3);
      for (const node of nodes) {
        expect(node.metadata).toMatchObject({
          source: 'inventory_builder',
          layoutId: testLayoutId,
          publishedRevision: 3,
        });
      }

      // The PUBLISH revision snapshot also records physical location codes
      const revisions = await layoutService.getRevisions(testLayoutId);
      const publishRev = revisions.find((r) => r.revisionNumber === 2);
      expect(publishRev).toBeDefined();
      const publishBySlot = new Map(
        (publishRev?.mappingsSnapshot ?? []).map((m) => [m.slotId, m]),
      );
      expect(publishBySlot.get('drawer_slot_r0_c0')?.locationCode).toBe(
        `DRW-1-${testRunId}`,
      );
      expect(publishBySlot.get('drawer_slot_r0_c1')?.locationCode).toBe(
        `DRW-2-${testRunId}`,
      );
      expect(publishBySlot.get('drawer_slot_r1_c0')?.locationCode).toBe(
        `DRW-3-${testRunId}`,
      );
    });

    it('repeating publication of unchanged layout is truly idempotent (0 revision increment, 0 snapshots, 0 node mutations)', async () => {
      if (!hasDbUrl) return;

      const revsBefore = await layoutService.getRevisions(testLayoutId);

      // Publish again with expectedRevision: 3
      const republished = await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 3,
        changeDescription: 'Idempotent publication replay',
      });

      expect(republished.status).toBe('PUBLISHED');
      // Revision MUST NOT increment
      expect(republished.revision).toBe(3);

      // No new revision snapshot appended
      const revsAfter = await layoutService.getRevisions(testLayoutId);
      expect(revsAfter.length).toBe(revsBefore.length);

      // Spatial nodes should still exist without duplicates
      const nodes = await db
        .select()
        .from(spatialNodes)
        .where(
          inArray(spatialNodes.locationId, [
            childLoc1Id,
            childLoc2Id,
            childLoc3Id,
          ]),
        );

      expect(nodes).toHaveLength(3);
    });

    it('detects coordinate drift and repairs spatial nodes while bumping revision', async () => {
      if (!hasDbUrl) return;

      // Layout is currently revision 3 and PUBLISHED
      // Intentionally drift node coordinates directly in DB
      await db
        .update(spatialNodes)
        .set({ positionX: '999.0000' })
        .where(eq(spatialNodes.locationId, childLoc1Id));

      const revsBefore = await layoutService.getRevisions(testLayoutId);

      // Re-publish layout (expectedRevision 3 -> 4)
      const repaired = await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 3,
        changeDescription: 'Repaired coordinate drift',
      });

      expect(repaired.revision).toBe(4);
      const revsAfter = await layoutService.getRevisions(testLayoutId);
      expect(revsAfter.length).toBe(revsBefore.length + 1);

      // Verify coordinate was repaired back within GEOMETRY_TOLERANCE_MM
      const [repairedNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, childLoc1Id));
      expect(Number(repairedNode?.positionX)).toBeLessThan(500);
    });

    it('detects slotId metadata drift and repairs it while bumping revision', async () => {
      if (!hasDbUrl) return;

      // Tamper slotId in metadata
      const [node] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, childLoc2Id));

      await db
        .update(spatialNodes)
        .set({
          metadata: {
            ...(node?.metadata || {}),
            slotId: 'tampered_slot_id',
          },
        })
        .where(eq(spatialNodes.locationId, childLoc2Id));

      // Re-publish layout (expectedRevision 4 -> 5)
      const repaired = await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 4,
        changeDescription: 'Repaired slotId drift',
      });

      expect(repaired.revision).toBe(5);

      const [repairedNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, childLoc2Id));
      const meta = repairedNode?.metadata as Record<string, unknown>;
      expect(meta?.slotId).toBe('drawer_slot_r0_c1');
    });

    it('detects visibility drift and resets isVisible while bumping revision', async () => {
      if (!hasDbUrl) return;

      // Tamper visibility
      await db
        .update(spatialNodes)
        .set({ isVisible: false })
        .where(eq(spatialNodes.locationId, childLoc1Id));

      // Re-publish layout (expectedRevision 5 -> 6)
      const repaired = await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 5,
        changeDescription: 'Repaired visibility drift',
      });

      expect(repaired.revision).toBe(6);

      const [repairedNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, childLoc1Id));
      expect(repairedNode?.isVisible).toBe(true);
    });

    it('detects scale drift and resets scale while bumping revision', async () => {
      if (!hasDbUrl) return;

      // Tamper scale
      await db
        .update(spatialNodes)
        .set({ scaleX: '2.5000' })
        .where(eq(spatialNodes.locationId, childLoc1Id));

      // Re-publish layout (expectedRevision 6 -> 7)
      const repaired = await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 6,
        changeDescription: 'Repaired scale drift',
      });

      expect(repaired.revision).toBe(7);

      const [repairedNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, childLoc1Id));
      expect(Number(repairedNode?.scaleX)).toBeCloseTo(1.0);
    });

    it('concurrent publication of two drafts for same parent allows exactly one to publish and rejects the other with HTTP 409', async () => {
      if (!hasDbUrl) return;

      // 1. Seed fresh parent location for concurrency test
      const [concParent] = await db
        .insert(locations)
        .values({
          code: `CONC-CAB-${testRunId}`,
          name: `Concurrency Parent ${testRunId}`,
          kind: 'cabinet',
          isActive: true,
        })
        .returning();
      const [concChild] = await db
        .insert(locations)
        .values({
          code: `CONC-DRW-${testRunId}`,
          name: `Concurrency Drawer ${testRunId}`,
          kind: 'drawer',
          parentId: concParent?.id,
          isActive: true,
        })
        .returning();

      if (!concParent || !concChild) {
        throw new Error('Failed to create concurrency locations');
      }
      createdLocationIds.push(concParent.id, concChild.id);

      // 2. Create two draft layouts for the same parent container
      const layoutA = await layoutService.createLayout({
        code: `CONC-A-${testRunId}`,
        name: 'Concurrent Layout A',
        parentLocationId: concParent.id,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: concChild.id,
          },
        ],
      });
      createdLayoutIds.push(layoutA.id);

      const layoutB = await layoutService.createLayout({
        code: `CONC-B-${testRunId}`,
        name: 'Concurrent Layout B',
        parentLocationId: concParent.id,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: concChild.id,
          },
        ],
      });
      createdLayoutIds.push(layoutB.id);

      // 3. Fire concurrent publications simultaneously
      const results = await Promise.allSettled([
        layoutService.publishLayout(layoutA.id, { expectedRevision: 1 }),
        layoutService.publishLayout(layoutB.id, { expectedRevision: 1 }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE publication MUST succeed, and exactly ONE must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedResult = rejected[0] as PromiseRejectedResult;
      expect(rejectedResult.reason).toBeInstanceOf(
        PublishedLayoutAlreadyExistsError,
      );

      // Verify in DB: exactly one layout is PUBLISHED
      const dbLayouts = await db
        .select()
        .from(spatialLayouts)
        .where(inArray(spatialLayouts.id, [layoutA.id, layoutB.id]));

      const publishedLayouts = dbLayouts.filter(
        (l) => l.status === 'PUBLISHED',
      );
      const draftLayouts = dbLayouts.filter((l) => l.status === 'DRAFT');

      expect(publishedLayouts).toHaveLength(1);
      expect(draftLayouts).toHaveLength(1);
    });

    it('rejects publishing a draft layout when another layout is already PUBLISHED for the parent location', async () => {
      if (!hasDbUrl) return;

      // testLayoutId is currently PUBLISHED for parentLocationId
      // Create a second draft layout under the same parent
      const draft2 = await layoutService.createLayout({
        code: `LAYOUT-DRAFT2-${testRunId}`,
        name: 'Second Layout for Same Cabinet',
        parentLocationId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
      });
      createdLayoutIds.push(draft2.id);

      // Attempt to publish draft2 -> must fail with PublishedLayoutAlreadyExistsError (HTTP 409)
      await expect(
        layoutService.publishLayout(draft2.id, {
          expectedRevision: 1,
        }),
      ).rejects.toBeInstanceOf(PublishedLayoutAlreadyExistsError);
    });

    it('prunes obsolete builder-owned spatial nodes when slots are unmapped', async () => {
      if (!hasDbUrl) return;

      // Update layout to unmap childLoc3Id (expectedRevision is 7 after drift tests)
      await layoutService.updateLayout(testLayoutId, {
        expectedRevision: 7,
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: childLoc1Id,
          },
          {
            slotId: 'drawer_slot_r0_c1',
            slotCode: 'R0-C1',
            locationId: childLoc2Id,
          },
        ],
        changeDescription: 'Removed slot 3 mapping',
      });

      // Publish layout (revision 8 -> 9)
      await layoutService.publishLayout(testLayoutId, {
        expectedRevision: 8,
        changeDescription: 'Published after removing slot 3',
      });

      // childLoc3Id spatial node should be pruned!
      const nodes = await db
        .select()
        .from(spatialNodes)
        .where(
          inArray(spatialNodes.locationId, [
            childLoc1Id,
            childLoc2Id,
            childLoc3Id,
          ]),
        );

      expect(nodes).toHaveLength(2);
      const mappedLocIds = nodes.map((n) => n.locationId);
      expect(mappedLocIds).toContain(childLoc1Id);
      expect(mappedLocIds).toContain(childLoc2Id);
      expect(mappedLocIds).not.toContain(childLoc3Id);
    });
  });

  describe('4. Spatial Node Ownership Conflicts & Overwrite Safety', () => {
    let conflictLayoutId: string;
    let ownershipParentId: string;
    let ownershipChildId: string;

    it('rejects publication when conflicting manual/CAD node exists without overwrite flag', async () => {
      if (!hasDbUrl) return;

      // Dedicated parent container so no other PUBLISHED layout can shadow this test
      const pair = await createContainerPair('OWN');
      ownershipParentId = pair.parentId;
      ownershipChildId = pair.childId;

      // Create a manual node on the ownership child with complete transform and metadata
      await db
        .delete(spatialNodes)
        .where(eq(spatialNodes.locationId, ownershipChildId));
      await db.insert(spatialNodes).values({
        locationId: ownershipChildId,
        positionX: '100.0000',
        positionY: '200.0000',
        positionZ: '300.0000',
        rotationX: '0.0000',
        rotationY: '0.5000',
        rotationZ: '0.0000',
        scaleX: '1.2500',
        scaleY: '1.5000',
        scaleZ: '1.7500',
        isVisible: true,
        metadata: {
          source: 'cad_import',
          author: 'engineer_bob',
          cadPartNumber: 'CAD-999',
        },
      });

      // Create layout mapping the ownership child
      const layout = await layoutService.createLayout({
        code: `LAYOUT-CONFLICT-${testRunId}`,
        name: 'CAD Conflict Layout',
        parentLocationId: ownershipParentId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: ownershipChildId,
          },
        ],
      });
      conflictLayoutId = layout.id;
      createdLayoutIds.push(conflictLayoutId);

      // Attempt to publish without overwrite flag -> must fail with SpatialNodeOwnershipConflictError
      await expect(
        layoutService.publishLayout(conflictLayoutId, {
          expectedRevision: 1,
          overwriteManualSpatialNodes: false,
        }),
      ).rejects.toBeInstanceOf(SpatialNodeOwnershipConflictError);
    });

    it('overwrites manual node safely when overwriteManualSpatialNodes: true, preserving supersededGeometry', async () => {
      if (!hasDbUrl) return;

      // Publish with overwriteManualSpatialNodes: true
      const published = await layoutService.publishLayout(conflictLayoutId, {
        expectedRevision: 1,
        overwriteManualSpatialNodes: true,
        changeDescription: 'Authorized manual overwrite',
      });

      expect(published.status).toBe('PUBLISHED');

      // Verify node is now builder-owned and has supersededGeometry
      const [node] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, ownershipChildId));

      expect(node).toBeDefined();
      expect(node?.metadata).toMatchObject({
        source: 'inventory_builder',
        layoutId: conflictLayoutId,
      });

      const meta = (node?.metadata as Record<string, unknown>) || {};
      expect(meta.supersededGeometry).toBeDefined();
      const superseded = meta.supersededGeometry as Record<string, unknown>;
      // The prior node's full metadata (including its original source) is preserved
      const supersededMeta = superseded.metadata as Record<string, unknown>;
      expect(supersededMeta.source).toBe('cad_import');
      expect(superseded.positionX).toBe('100.0000');
    });

    it('restores superseded manual/CAD geometry when an overwritten slot is subsequently unmapped', async () => {
      if (!hasDbUrl) return;

      // conflictLayoutId was published with overwriteManualSpatialNodes: true on the ownership child (rev 2)
      // Now update conflictLayoutId to unmap the ownership child
      await layoutService.updateLayout(conflictLayoutId, {
        expectedRevision: 2,
        mappings: [],
        changeDescription: 'Unmapped slot 3 from conflict layout',
      });

      // Publish conflictLayoutId with empty mappings (rev 3 -> 4)
      await layoutService.publishLayout(conflictLayoutId, {
        expectedRevision: 3,
        changeDescription: 'Published with unmapped slot',
      });

      // The ownership child's spatial node should NOT be deleted!
      // Its manual CAD geometry should be RESTORED!
      const [restoredNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, ownershipChildId));

      expect(restoredNode).toBeDefined();
      expect(Number(restoredNode?.positionX)).toBeCloseTo(100.0);
      expect(Number(restoredNode?.positionY)).toBeCloseTo(200.0);
      expect(Number(restoredNode?.positionZ)).toBeCloseTo(300.0);
      expect(Number(restoredNode?.rotationY)).toBeCloseTo(0.5);
      expect(Number(restoredNode?.scaleX)).toBeCloseTo(1.25);
      expect(Number(restoredNode?.scaleY)).toBeCloseTo(1.5);
      expect(Number(restoredNode?.scaleZ)).toBeCloseTo(1.75);
      expect(restoredNode?.isVisible).toBe(true);
      const restoredMeta = restoredNode?.metadata as Record<
        string,
        unknown
      > | null;
      expect(restoredMeta?.source).toBe('cad_import');
      expect(restoredMeta?.author).toBe('engineer_bob');
      expect(restoredMeta?.cadPartNumber).toBe('CAD-999');
    });

    it('fails safely with MalformedSupersededGeometryError and rolls back transaction when supersededGeometry is malformed', async () => {
      if (!hasDbUrl) return;

      // Dedicated pair so this test never disturbs other layouts' spatial nodes
      const pair = await createContainerPair('MALFORM');
      const malformChildId = pair.childId;

      // Seed a manual node on the malformed-test child
      await db
        .delete(spatialNodes)
        .where(eq(spatialNodes.locationId, malformChildId));
      const [originalNode] = await db
        .insert(spatialNodes)
        .values({
          locationId: malformChildId,
          positionX: '50.0000',
          positionY: '60.0000',
          positionZ: '70.0000',
          metadata: {
            source: 'cad_manual',
            originalPart: 'CRITICAL-VALVE',
          },
        })
        .returning();

      if (!originalNode) throw new Error('Failed to create original node');

      // Create layout overwriting the malformed-test child
      const malformLayout = await layoutService.createLayout({
        code: `MALFORM-CAD-${testRunId}`,
        name: 'Malformed CAD Test Layout',
        parentLocationId: pair.parentId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: malformChildId,
          },
        ],
      });
      createdLayoutIds.push(malformLayout.id);

      // Overwrite manual node
      await layoutService.publishLayout(malformLayout.id, {
        expectedRevision: 1,
        overwriteManualSpatialNodes: true,
      });

      // Corrupt supersededGeometry directly in DB (e.g. non-numeric / malformed position coordinates)
      await db
        .update(spatialNodes)
        .set({
          metadata: {
            source: 'inventory_builder',
            layoutId: malformLayout.id,
            slotId: 'drawer_slot_r0_c0',
            supersededGeometry: {
              // Corrupted: positionX is missing/invalid
              positionY: '60.0000',
              positionZ: '70.0000',
            },
          },
        })
        .where(eq(spatialNodes.locationId, malformChildId));

      // Attempt to unmap the slot on the PUBLISHED layout -> the in-transaction node
      // reconciliation must reject with MalformedSupersededGeometryError and roll back
      await expect(
        layoutService.updateLayout(malformLayout.id, {
          expectedRevision: 2,
          mappings: [],
          changeDescription: 'Unmap slot with corrupted CAD backup',
        }),
      ).rejects.toBeInstanceOf(MalformedSupersededGeometryError);

      // CRITICAL SAFETY CHECK: Verify transaction rollback!
      // The spatial node must NOT be deleted, and its identity must be preserved!
      const [persistedNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, malformChildId));

      expect(persistedNode).toBeDefined();
      expect(persistedNode?.id).toBe(originalNode.id);
    });
  });

  describe('5. Layout Archiving & Spatial Node Cleanup', () => {
    it('archives layout, cleans up builder-owned spatial nodes, and appends revision snapshot', async () => {
      if (!hasDbUrl) return;

      // Dedicated pair so no other PUBLISHED layout can shadow this test
      const pair = await createContainerPair('ARCHIVE');

      const layout = await layoutService.createLayout({
        code: `LAYOUT-ARCHIVE-${testRunId}`,
        name: 'Archive Test Layout',
        parentLocationId: pair.parentId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: pair.childId,
          },
        ],
      });
      createdLayoutIds.push(layout.id);

      // Publish first
      await layoutService.publishLayout(layout.id, {
        expectedRevision: 1,
        changeDescription: 'Publish before archive',
      });

      // Spatial node exists
      const [nodeBefore] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, pair.childId));
      expect(nodeBefore).toBeDefined();

      // Archive layout
      const archived = await layoutService.archiveLayout(layout.id, {
        expectedRevision: 2,
        changeDescription: 'Decommissioned cabinet unit',
      });

      expect(archived.status).toBe('ARCHIVED');
      expect(archived.revision).toBe(3);

      // Spatial node should be cleaned up!
      const [nodeAfter] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, pair.childId));
      expect(nodeAfter).toBeUndefined();

      // Revision history still intact with ARCHIVE action
      const revisions = await layoutService.getRevisions(layout.id);
      const archiveRev = revisions.find((r) => r.revisionNumber === 2);
      expect(archiveRev).toBeDefined();
      expect(archiveRev?.diffSummary).toEqual({ action: 'ARCHIVE' });

      // The ARCHIVE revision snapshot records the physical location code, not the slot code
      expect(archiveRev?.mappingsSnapshot).toHaveLength(1);
      expect(archiveRev?.mappingsSnapshot[0]?.locationCode).toBe(
        pair.childCode,
      );
      expect(archiveRev?.mappingsSnapshot[0]?.slotCode).toBe('R0-C0');
    });

    it('rejects hard deletion of a PUBLISHED layout (must use archive instead)', async () => {
      if (!hasDbUrl) return;

      // testLayoutId is PUBLISHED
      await expect(
        layoutService.deleteLayout(testLayoutId),
      ).rejects.toBeInstanceOf(CannotDeleteNonDraftLayoutError);
    });

    it('rejects hard deletion of an ARCHIVED layout (preserves immutable revision history)', async () => {
      if (!hasDbUrl) return;

      // Archive testLayoutId first.
      // Revision is 8: the unmap UPDATE already pruned the spatial node and bumped
      // the revision, so the follow-up publish is idempotent (no further increment).
      await layoutService.archiveLayout(testLayoutId, {
        expectedRevision: 8,
        changeDescription: 'Decommissioning test layout',
      });

      // Attempt hard deletion -> must fail with CannotDeleteNonDraftLayoutError
      await expect(
        layoutService.deleteLayout(testLayoutId),
      ).rejects.toBeInstanceOf(CannotDeleteNonDraftLayoutError);
    });

    it('rejects updateLayout on an ARCHIVED layout', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.updateLayout(testLayoutId, {
          expectedRevision: 9,
          changeDescription: 'Cannot mutate archived layout',
        }),
      ).rejects.toBeInstanceOf(CannotModifyArchivedLayoutError);
    });

    it('rejects publishLayout on an ARCHIVED layout', async () => {
      if (!hasDbUrl) return;

      await expect(
        layoutService.publishLayout(testLayoutId, {
          expectedRevision: 9,
        }),
      ).rejects.toBeInstanceOf(CannotModifyArchivedLayoutError);
    });

    it('allows hard deletion of an un-published DRAFT layout', async () => {
      if (!hasDbUrl) return;

      const draft = await layoutService.createLayout({
        code: `LAYOUT-DELETE-DRAFT-${testRunId}`,
        name: 'Ephemeral Draft Layout',
        parentLocationId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
      });

      await layoutService.deleteLayout(draft.id);

      const [found] = await db
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, draft.id));
      expect(found).toBeUndefined();
    });
  });

  describe('6. Transaction Rollback & Atomicity', () => {
    it('rolls back layout revision and prevents partial spatial-node writes on failure', async () => {
      if (!hasDbUrl) return;

      // Dedicated pair so the failed publication cannot touch other layouts' nodes
      const pair = await createContainerPair('ROLLBACK');

      const layout = await layoutService.createLayout({
        code: `LAYOUT-ROLLBACK-${testRunId}`,
        name: 'Rollback Test Layout',
        parentLocationId: pair.parentId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'R0-C0',
            locationId: pair.childId,
          },
        ],
      });
      createdLayoutIds.push(layout.id);

      // Spy on internal reconcile method to simulate a failure
      const reconcileSpy = jest
        .spyOn(layoutService as any, 'reconcileSpatialNodesInTx')
        .mockRejectedValueOnce(
          new Error('Simulated spatial node engine crash'),
        );

      await expect(
        layoutService.publishLayout(layout.id, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow('Simulated spatial node engine crash');

      reconcileSpy.mockRestore();

      // Verify that database transaction rolled back:
      // 1. Layout status should still be DRAFT and revision still 1
      const [persisted] = await db
        .select()
        .from(spatialLayouts)
        .where(eq(spatialLayouts.id, layout.id));
      expect(persisted?.status).toBe('DRAFT');
      expect(persisted?.revision).toBe(1);

      // 2. No revision snapshot was recorded
      const revisions = await layoutService.getRevisions(layout.id);
      expect(revisions).toHaveLength(0);

      // 3. No spatial nodes were committed
      const nodes = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, pair.childId));
      expect(nodes).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 4. Top-Level Container (Parent) Assignment Semantics
  // ==========================================================================
  describe('4. Top-Level Container Assignment Semantics', () => {
    it('publishes compartments under the assigned container without duplicating the container spatial node', async () => {
      if (!hasDbUrl) return;

      // Pre-existing authoritative container node (e.g. manually authored)
      const [containerNode] = await db
        .insert(spatialNodes)
        .values({
          locationId: unrelatedParentId,
          positionX: '10.0000',
          positionY: '0.0000',
          positionZ: '20.0000',
          metadata: { source: 'manual' },
        })
        .returning();
      if (!containerNode) throw new Error('Failed to create container node');

      const layout = await layoutService.createLayout({
        code: `LAYOUT-CONT-${testRunId}`,
        name: 'Container Assignment Layout',
        parentLocationId: unrelatedParentId,
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(600, 2, 2),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'A01',
            locationId: unrelatedChildId,
          },
        ],
      });
      createdLayoutIds.push(layout.id);

      // The container is the layout's parentLocationId, never a mapping row
      expect(layout.parentLocationId).toBe(unrelatedParentId);
      expect(layout.mappings.map((m) => m.locationId)).toEqual([
        unrelatedChildId,
      ]);

      const published = await layoutService.publishLayout(layout.id, {
        expectedRevision: 1,
      });
      expect(published.status).toBe('PUBLISHED');
      expect(published.parentLocationId).toBe(unrelatedParentId);

      // The compartment node is parented under the container's existing node
      const [childNode] = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, unrelatedChildId));
      expect(childNode?.parentSpatialNodeId).toBe(containerNode.id);
      expect(childNode?.metadata).toMatchObject({
        source: 'inventory_builder',
        layoutId: layout.id,
      });

      // Exactly one node exists for the container: the original one. Publishing
      // did not create a layout-owned duplicate nor mutate its coordinates.
      const containerNodes = await db
        .select()
        .from(spatialNodes)
        .where(eq(spatialNodes.locationId, unrelatedParentId));
      expect(containerNodes).toHaveLength(1);
      expect(containerNodes[0]?.id).toBe(containerNode.id);
      expect(containerNodes[0]?.positionX).toBe('10.0000');
      expect(containerNodes[0]?.positionZ).toBe('20.0000');
      expect(containerNodes[0]?.metadata).toEqual({ source: 'manual' });

      // Persisted mapping rows reference compartments only
      const mappingRows = await db
        .select()
        .from(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, layout.id));
      expect(mappingRows).toHaveLength(1);
      expect(mappingRows[0]?.locationId).toBe(unrelatedChildId);
      expect(
        mappingRows.some((row) => row.locationId === unrelatedParentId),
      ).toBe(false);
    });
  });
});
