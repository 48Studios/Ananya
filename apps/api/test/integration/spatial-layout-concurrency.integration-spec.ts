import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { getDb, closeDatabaseConnection } from '@ananya/database';
import {
  locations,
  spatialLayouts,
  spatialNodes,
} from '@ananya/database/schema';
import { eq, ilike, inArray, sql } from '@ananya/database/query';
import {
  ConcurrentHierarchyMutationError,
  InactiveLayoutParentError,
  InactiveLocationMappingError,
  LocationNotFoundError,
} from '@ananya/inventory';
import { SpatialLayoutService } from '../../src/spatial/spatial-layout.service';
import { DrizzleSpatialLayoutRepository } from '../../src/infrastructure/repositories/drizzle-spatial-layout.repository';
import { DrizzleLocationRepository } from '../../src/infrastructure/repositories/drizzle-location.repository';
import { DrizzleSpatialNodeRepository } from '../../src/infrastructure/repositories/drizzle-spatial.repository';

type LayoutDbClient = ReturnType<typeof getDb>;
type LayoutTx = Parameters<Parameters<LayoutDbClient['transaction']>[0]>[0];

let db: LayoutDbClient;

/**
 * Polls pg_stat_activity until PostgreSQL reports an ACTIVE backend waiting on a
 * row lock while running a statement against `locations`.
 *
 * This is the synchronization barrier used by every test in this file. The
 * blocker transaction keeps its row lock held until the test explicitly releases
 * it, and the test proceeds only once the database itself confirms that the
 * competing layout-creation transaction is waiting on that lock. A timing sleep
 * could never prove genuine overlap; this observation can. If the lock under
 * test is absent, no such backend ever appears and the barrier assertion fails.
 */
async function waitForLocationLockWait(timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result: unknown = await db.execute(sql`
      select count(*)::int as blocked
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and state = 'active'
        and wait_event_type = 'Lock'
        and query ilike '%"locations"%'
        and query not ilike '%pg_stat_activity%'
    `);
    const rows: Array<{ blocked: number }> = Array.isArray(result)
      ? (result as Array<{ blocked: number }>)
      : ((result as { rows?: Array<{ blocked: number }> }).rows ?? []);
    if ((rows[0]?.blocked ?? 0) > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

interface HeldMutation {
  /** Resolves once the row-locking statement has executed (lock held, uncommitted). */
  locked: Promise<void>;
  /** Commits the blocker transaction, releasing every lock it holds. */
  release: () => Promise<void>;
}

/**
 * Runs `mutate` inside an open transaction and keeps that transaction (and its
 * row locks) open until `release()` is called.
 */
function holdUncommittedMutation(
  mutate: (tx: LayoutTx) => Promise<void>,
): HeldMutation {
  let markLocked!: () => void;
  const locked = new Promise<void>((resolve) => {
    markLocked = resolve;
  });
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  const done = db.transaction(async (tx) => {
    await mutate(tx);
    markLocked();
    await gate;
  });

  return {
    locked,
    release: async () => {
      openGate();
      await done;
    },
  };
}

describe('Spatial Layout Concurrency — hierarchy lock serialization', () => {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const runTag = `zzrace${Math.random().toString(36).slice(2, 7)}`;

  let layoutService: SpatialLayoutService;

  const createdLocationIds: string[] = [];
  const createdLayoutIds: string[] = [];

  const smdConfig = (widthMm: number) => ({
    templateType: 'SMD_DRAWER_CABINET' as const,
    dimensions: { widthMm, heightMm: 1200, depthMm: 450 },
    wallThicknessMm: 15,
    rows: 2,
    columns: 2,
  });

  const createParent = async (tag: string): Promise<string> => {
    const [parent] = await db
      .insert(locations)
      .values({
        code: `${runTag}-CAB-${tag}`,
        name: `Race Cabinet ${tag} ${runTag}`,
        kind: 'cabinet',
        isActive: true,
      })
      .returning();
    if (!parent) throw new Error('Failed to create race parent location');
    createdLocationIds.push(parent.id);
    return parent.id;
  };

  const createChild = async (
    tag: string,
    parentId: string,
  ): Promise<string> => {
    const [child] = await db
      .insert(locations)
      .values({
        code: `${runTag}-DRW-${tag}`,
        name: `Race Drawer ${tag} ${runTag}`,
        kind: 'drawer',
        parentId,
        containerId: parentId,
        isActive: true,
      })
      .returning();
    if (!child) throw new Error('Failed to create race child location');
    createdLocationIds.push(child.id);
    return child.id;
  };

  /**
   * Builds a three-level fixture chain P -> A -> M plus an unrelated parent P'.
   *
   * The intermediate ancestor A is the row no pre-fix code path locks: the
   * hierarchy verdict for M depends on A, but only P and M appear in any
   * endpoint lock list. Reparenting A to P' while a layout mutation validates
   * is the exact race this suite's second half covers.
   */
  const createAncestorChain = async (tag: string) => {
    const parentId = await createParent(`${tag}-P`);
    const [ancestor] = await db
      .insert(locations)
      .values({
        code: `${runTag}-SUB-${tag}`,
        name: `Race Sub-assembly ${tag} ${runTag}`,
        kind: 'drawer',
        parentId,
        containerId: parentId,
        isActive: true,
      })
      .returning();
    if (!ancestor) throw new Error('Failed to create race ancestor location');
    createdLocationIds.push(ancestor.id);
    const mappedId = await createChild(`${tag}-M`, ancestor.id);
    const otherParentId = await createParent(`${tag}-P2`);
    return { parentId, ancestorId: ancestor.id, mappedId, otherParentId };
  };

  /**
   * Runs an async operation capturing settlement, so the test can assert the
   * victim genuinely blocked on the held lock before the blocker released it.
   */
  const runVictim = <T>(operation: Promise<T>) => {
    let settled = false;
    const outcome = operation.then(
      (value) => {
        settled = true;
        return { ok: true as const, value };
      },
      (error: unknown) => {
        settled = true;
        return { ok: false as const, error };
      },
    );
    return {
      outcome,
      isSettled: () => settled,
    };
  };

  beforeAll(() => {
    if (!hasDbUrl) return;
    db = getDb();
    layoutService = new SpatialLayoutService(
      new DrizzleSpatialLayoutRepository(db),
      new DrizzleLocationRepository(),
      new DrizzleSpatialNodeRepository(db),
    );
  });

  afterAll(async () => {
    if (!hasDbUrl) return;

    // Delete every layout this run created — including one created by a test that
    // failed before it could track the id — so teardown can never cascade a
    // location-deletion error over the real failure. Mappings and revisions are
    // removed by their ON DELETE CASCADE foreign keys.
    const layoutRows = await db
      .select({ id: spatialLayouts.id })
      .from(spatialLayouts)
      .where(ilike(spatialLayouts.code, `${runTag}%`));
    const layoutIds = new Set<string>([
      ...createdLayoutIds,
      ...layoutRows.map((row) => row.id),
    ]);
    if (layoutIds.size > 0) {
      await db
        .delete(spatialLayouts)
        .where(inArray(spatialLayouts.id, [...layoutIds]));
    }

    if (createdLocationIds.length > 0) {
      await db
        .delete(spatialNodes)
        .where(inArray(spatialNodes.locationId, createdLocationIds));
      // Children before parents; deleting an id already removed by a test is a no-op.
      await db
        .delete(locations)
        .where(inArray(locations.id, createdLocationIds));

      // Guard: this run's fixtures must be gone. Turns any future leak into a
      // loud failure instead of silent database drift.
      const leftovers = await db
        .select({ id: locations.id, code: locations.code })
        .from(locations)
        .where(inArray(locations.id, createdLocationIds));
      if (leftovers.length > 0) {
        throw new Error(
          `spatial-layout-concurrency fixture leak: ${leftovers.length} location(s) survived cleanup: ${leftovers
            .map((row) => row.code)
            .join(', ')}`,
        );
      }
    }

    await closeDatabaseConnection();
  });

  it('serializes draft creation against a concurrent parent deactivation', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('DEACT');
    const layoutCode = `${runTag}-DEACT-PARENT`;

    // Blocker: hold an exclusive row lock on the parent (uncommitted deactivation).
    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ isActive: false })
        .where(eq(locations.id, parentId));
    });
    await blocker.locked;

    let createSettled = false;
    const createOutcome = layoutService
      .createLayout({
        parentLocationId: parentId,
        code: layoutCode,
        name: 'Deactivation race layout',
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000),
      })
      .then(
        (value) => {
          createSettled = true;
          return { ok: true as const, value };
        },
        (error: unknown) => {
          createSettled = true;
          return { ok: false as const, error };
        },
      );

    // Barrier: wait until PostgreSQL confirms the create is blocked on the parent
    // row lock held by the blocker transaction, and capture whether it settled.
    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = createSettled;
    await blocker.release();

    const outcome = await createOutcome;
    if (outcome.ok) {
      createdLayoutIds.push(outcome.value.id);
    }

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.status).toBe('DRAFT');
      expect(outcome.value.revision).toBe(1);
    }

    // The deactivation is committed and visible, so the create's validation ran
    // strictly after it — serialized by the shared parent lock, never interleaved.
    const [parentRow] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, parentId));
    expect(parentRow?.isActive).toBe(false);
  });

  it('rejects creation cleanly when the parent is deleted while the create is validating', async () => {
    if (!hasDbUrl) return;

    // Parent without children so it is deletable.
    const parentId = await createParent('DEL');
    const layoutCode = `${runTag}-DEL-PARENT`;

    const blocker = holdUncommittedMutation(async (tx) => {
      await tx.delete(locations).where(eq(locations.id, parentId));
    });
    await blocker.locked;

    let createSettled = false;
    const createOutcome = layoutService
      .createLayout({
        parentLocationId: parentId,
        code: layoutCode,
        name: 'Deletion race layout',
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000),
      })
      .then(
        (value) => {
          createSettled = true;
          return { ok: true as const, value };
        },
        (error: unknown) => {
          createSettled = true;
          return { ok: false as const, error };
        },
      );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = createSettled;
    await blocker.release();

    const outcome = await createOutcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    // The locked existence check re-reads the committed state and reports the
    // parent as gone; no layout (and therefore no dangling reference) is created.
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(LocationNotFoundError);
    }

    const rows = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.code, layoutCode));
    expect(rows).toHaveLength(0);
  });

  it('rejects a mapping to a location deactivated while the create is validating', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('CHILD-DEACT');
    const childId = await createChild('CHILD-DEACT', parentId);
    const layoutCode = `${runTag}-CHILD-DEACT`;

    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ isActive: false })
        .where(eq(locations.id, childId));
    });
    await blocker.locked;

    let createSettled = false;
    const createOutcome = layoutService
      .createLayout({
        parentLocationId: parentId,
        code: layoutCode,
        name: 'Child deactivation race layout',
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'A01',
            locationId: childId,
          },
        ],
      })
      .then(
        (value) => {
          createSettled = true;
          return { ok: true as const, value };
        },
        (error: unknown) => {
          createSettled = true;
          return { ok: false as const, error };
        },
      );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = createSettled;
    await blocker.release();

    const outcome = await createOutcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(InactiveLocationMappingError);
    }

    const rows = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.code, layoutCode));
    expect(rows).toHaveLength(0);
  });

  it('rejects a mapping whose location is reparented while the create is validating', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('REPARENT');
    const childId = await createChild('REPARENT', parentId);
    const otherParentId = await createParent('REPARENT-OTHER');
    const layoutCode = `${runTag}-REPARENT`;

    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ parentId: otherParentId })
        .where(eq(locations.id, childId));
    });
    await blocker.locked;

    let createSettled = false;
    const createOutcome = layoutService
      .createLayout({
        parentLocationId: parentId,
        code: layoutCode,
        name: 'Reparent race layout',
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'A01',
            locationId: childId,
          },
        ],
      })
      .then(
        (value) => {
          createSettled = true;
          return { ok: true as const, value };
        },
        (error: unknown) => {
          createSettled = true;
          return { ok: false as const, error };
        },
      );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = createSettled;
    await blocker.release();

    const outcome = await createOutcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(ConcurrentHierarchyMutationError);
    }

    const rows = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.code, layoutCode));
    expect(rows).toHaveLength(0);
  });

  it('rejects creation when an intermediate ancestor is reparented while the create is validating', async () => {
    if (!hasDbUrl) return;

    const { parentId, ancestorId, mappedId, otherParentId } =
      await createAncestorChain('CHAIN-CREATE');
    const layoutCode = `${runTag}-CHAIN-CREATE`;

    // Blocker: hold an exclusive row lock on the INTERMEDIATE ancestor A.
    // Pre-fix, no layout statement locks A, so this race completes without any
    // lock wait and commits an invalid mapping.
    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ parentId: otherParentId, containerId: otherParentId })
        .where(eq(locations.id, ancestorId));
    });
    await blocker.locked;

    const victim = runVictim(
      layoutService.createLayout({
        parentLocationId: parentId,
        code: layoutCode,
        name: 'Ancestor race layout (create)',
        templateType: 'SMD_DRAWER_CABINET',
        config: smdConfig(1000),
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'A01',
            locationId: mappedId,
          },
        ],
      }),
    );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = victim.isSettled();
    await blocker.release();

    const outcome = await victim.outcome;
    if (outcome.ok) {
      createdLayoutIds.push(outcome.value.id);
    }

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(ConcurrentHierarchyMutationError);
    }

    // Nothing persisted: no layout, no revision, no mappings.
    const rows = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.code, layoutCode));
    expect(rows).toHaveLength(0);
  });

  it('rejects a draft update when an intermediate ancestor is reparented while the update is validating', async () => {
    if (!hasDbUrl) return;

    const { parentId, ancestorId, mappedId, otherParentId } =
      await createAncestorChain('CHAIN-UPDATE');
    const layoutCode = `${runTag}-CHAIN-UPDATE`;

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: layoutCode,
      name: 'Ancestor race layout (update)',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: mappedId,
        },
      ],
    });
    createdLayoutIds.push(created.id);
    expect(created.revision).toBe(1);

    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ parentId: otherParentId, containerId: otherParentId })
        .where(eq(locations.id, ancestorId));
    });
    await blocker.locked;

    const victim = runVictim(
      layoutService.updateLayout(created.id, {
        expectedRevision: 1,
        changeDescription: 'Ancestor race update',
        mappings: [
          {
            slotId: 'drawer_slot_r0_c0',
            slotCode: 'A01',
            locationId: mappedId,
          },
        ],
      }),
    );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = victim.isSettled();
    await blocker.release();

    const outcome = await victim.outcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(ConcurrentHierarchyMutationError);
    }

    // Revision unchanged, no snapshot appended, mappings untouched.
    const [persisted] = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.id, created.id));
    expect(persisted?.revision).toBe(1);
    const revisions = await layoutService.getRevisions(created.id);
    expect(revisions).toHaveLength(0);
  });

  it('rejects publication when an intermediate ancestor is reparented while the publish is validating', async () => {
    if (!hasDbUrl) return;

    const { parentId, ancestorId, mappedId, otherParentId } =
      await createAncestorChain('CHAIN-PUBLISH');
    const layoutCode = `${runTag}-CHAIN-PUBLISH`;

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: layoutCode,
      name: 'Ancestor race layout (publish)',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: mappedId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ parentId: otherParentId, containerId: otherParentId })
        .where(eq(locations.id, ancestorId));
    });
    await blocker.locked;

    const victim = runVictim(
      layoutService.publishLayout(created.id, {
        expectedRevision: 1,
        changeDescription: 'Ancestor race publish',
      }),
    );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = victim.isSettled();
    await blocker.release();

    const outcome = await victim.outcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(ConcurrentHierarchyMutationError);
    }

    // Still a draft at revision 1 with no snapshots and no spatial nodes.
    const [persisted] = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.id, created.id));
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.revision).toBe(1);
    const revisions = await layoutService.getRevisions(created.id);
    expect(revisions).toHaveLength(0);
    const nodes = await db
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, mappedId));
    expect(nodes).toHaveLength(0);
  });

  it('allows publication when intermediate ancestor undergoes organizational reparent (parentId only, containerId unchanged)', async () => {
    if (!hasDbUrl) return;

    const { parentId, ancestorId, mappedId, otherParentId } =
      await createAncestorChain('CHAIN-ORG-REPARENT');
    const layoutCode = `${runTag}-CHAIN-ORG-REPARENT`;

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: layoutCode,
      name: 'Organizational reparent layout (publish)',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: mappedId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    // Reparent ONLY parentId, keeping physical containerId pointing to parentId
    await db
      .update(locations)
      .set({ parentId: otherParentId })
      .where(eq(locations.id, ancestorId));

    // Publication succeeds because physical containment is containerId-authoritative
    const published = await layoutService.publishLayout(created.id, {
      expectedRevision: 1,
      changeDescription: 'Publish after organizational-only reparent',
    });

    expect(published.status).toBe('PUBLISHED');
    expect(published.revision).toBe(2);

    const nodes = await db
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, mappedId));
    expect(nodes).toHaveLength(1);
  });

  it('rejects publication when the parent location is inactive', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('INACT-PUB');
    const childId = await createChild('INACT-PUB', parentId);
    const layoutCode = `${runTag}-INACT-PUB`;

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: layoutCode,
      name: 'Inactive parent layout (publish)',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    await db
      .update(locations)
      .set({ isActive: false })
      .where(eq(locations.id, parentId));

    await expect(
      layoutService.publishLayout(created.id, {
        expectedRevision: 1,
        changeDescription: 'Publish under inactive parent',
      }),
    ).rejects.toBeInstanceOf(InactiveLayoutParentError);

    // Still a draft at revision 1 with no snapshots and no spatial nodes.
    const [persisted] = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.id, created.id));
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.revision).toBe(1);
    const revisions = await layoutService.getRevisions(created.id);
    expect(revisions).toHaveLength(0);
    const nodes = await db
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, childId));
    expect(nodes).toHaveLength(0);
  });

  it('publishes successfully when the parent location is active', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('ACT-PUB');
    const childId = await createChild('ACT-PUB', parentId);
    const layoutCode = `${runTag}-ACT-PUB`;

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: layoutCode,
      name: 'Active parent layout (publish)',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    const published = await layoutService.publishLayout(created.id, {
      expectedRevision: 1,
      changeDescription: 'Publish under active parent',
    });

    expect(published.status).toBe('PUBLISHED');
    expect(published.revision).toBe(2);
    const nodes = await db
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, childId));
    expect(nodes).toHaveLength(1);
  });

  it('allows draft creation under an inactive parent', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('INACT-CREATE');
    await db
      .update(locations)
      .set({ isActive: false })
      .where(eq(locations.id, parentId));

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: `${runTag}-INACT-CREATE`,
      name: 'Draft under inactive parent',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
    });
    createdLayoutIds.push(created.id);

    expect(created.status).toBe('DRAFT');
    expect(created.revision).toBe(1);
  });

  it('allows draft update under an inactive parent', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('INACT-UPDATE');
    const childId = await createChild('INACT-UPDATE', parentId);

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: `${runTag}-INACT-UPDATE`,
      name: 'Draft update under inactive parent',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
    });
    createdLayoutIds.push(created.id);

    await db
      .update(locations)
      .set({ isActive: false })
      .where(eq(locations.id, parentId));

    const updated = await layoutService.updateLayout(created.id, {
      expectedRevision: 1,
      changeDescription: 'Update under inactive parent',
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childId,
        },
      ],
    });

    expect(updated.status).toBe('DRAFT');
    expect(updated.revision).toBe(2);
    expect(updated.mappings).toHaveLength(1);
  });

  it('keeps layouts readable under an inactive parent', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('INACT-READ');
    const childId = await createChild('INACT-READ', parentId);

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: `${runTag}-INACT-READ`,
      name: 'Readable layout under inactive parent',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    const updated = await layoutService.updateLayout(created.id, {
      expectedRevision: 1,
      changeDescription: 'Second revision before deactivation',
    });
    expect(updated.revision).toBe(2);

    await db
      .update(locations)
      .set({ isActive: false })
      .where(eq(locations.id, parentId));

    const byId = await layoutService.getLayout(created.id);
    expect(byId.id).toBe(created.id);
    expect(byId.status).toBe('DRAFT');

    const byParent = await layoutService.getLayoutsByParent(parentId);
    expect(byParent.some((l) => l.id === created.id)).toBe(true);

    const revisions = await layoutService.getRevisions(created.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.revisionNumber).toBe(1);
  });

  it('rejects publication after the parent is deactivated while publication is validating', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('RACE-DEACT-PUB');
    const childId = await createChild('RACE-DEACT-PUB', parentId);
    const layoutCode = `${runTag}-RACE-DEACT-PUB`;

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: layoutCode,
      name: 'Deactivation race layout (publish)',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    // Blocker: hold an exclusive row lock on the parent (uncommitted
    // deactivation). Publication's FOR UPDATE parent lock must wait on it.
    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .update(locations)
        .set({ isActive: false })
        .where(eq(locations.id, parentId));
    });
    await blocker.locked;

    const victim = runVictim(
      layoutService.publishLayout(created.id, {
        expectedRevision: 1,
        changeDescription: 'Deactivation race publish',
      }),
    );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = victim.isSettled();
    await blocker.release();

    const outcome = await victim.outcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBeInstanceOf(InactiveLayoutParentError);
    }

    // Still a draft at revision 1 with no snapshots and no spatial nodes.
    const [persisted] = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.id, created.id));
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.revision).toBe(1);
    const revisions = await layoutService.getRevisions(created.id);
    expect(revisions).toHaveLength(0);
    const nodes = await db
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, childId));
    expect(nodes).toHaveLength(0);
  });

  it('rejects publication after a lock-contended deactivation commits first', async () => {
    if (!hasDbUrl) return;

    const parentId = await createParent('RACE-PUB-FIRST');
    const childId = await createChild('RACE-PUB-FIRST', parentId);

    const created = await layoutService.createLayout({
      parentLocationId: parentId,
      code: `${runTag}-RACE-PUB-FIRST`,
      name: 'Publication-first race layout',
      templateType: 'SMD_DRAWER_CABINET',
      config: smdConfig(1000),
      mappings: [
        {
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childId,
        },
      ],
    });
    createdLayoutIds.push(created.id);

    // Blocker: hold the parent row FOR UPDATE inside an open transaction, the
    // same lock publication takes. A concurrent deactivation must wait on it.
    const blocker = holdUncommittedMutation(async (tx) => {
      await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, parentId))
        .for('update');
    });
    await blocker.locked;

    const victim = runVictim(
      db
        .update(locations)
        .set({ isActive: false })
        .where(eq(locations.id, parentId)),
    );

    const barrierObserved = await waitForLocationLockWait();
    const settledWhileBlocked = victim.isSettled();

    // Release the blocker FIRST so the deactivation commits while no publish
    // is in flight. Publication then starts against the committed inactive
    // parent — the reverse order of the companion test — and must reject.
    // (Starting the publish while the blocker is held would deadlock: the
    // publish waits on the blocker's FOR UPDATE parent lock while the
    // deactivation waits on the publish's layout-header lock ordering... in
    // practice both block on the same parent row and neither can proceed.)
    await blocker.release();
    const outcome = await victim.outcome;

    expect(barrierObserved).toBe(true);
    expect(settledWhileBlocked).toBe(false);
    expect(outcome.ok).toBe(true);

    const [parentRow] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, parentId));
    expect(parentRow?.isActive).toBe(false);

    await expect(
      layoutService.publishLayout(created.id, {
        expectedRevision: 1,
        changeDescription: 'Publication after committed deactivation',
      }),
    ).rejects.toBeInstanceOf(InactiveLayoutParentError);

    // Still a draft at revision 1 with no snapshots and no spatial nodes.
    const [persisted] = await db
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.id, created.id));
    expect(persisted?.status).toBe('DRAFT');
    expect(persisted?.revision).toBe(1);
    const revisions = await layoutService.getRevisions(created.id);
    expect(revisions).toHaveLength(0);
    const nodes = await db
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, childId));
    expect(nodes).toHaveLength(0);
  });
});
