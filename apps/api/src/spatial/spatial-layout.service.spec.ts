/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars */
import {
  computeSlotAcknowledgmentSignature,
  INCOMPATIBLE_COMPARTMENT_KINDS,
  SpatialLayoutNotFoundError,
  SpatialLayoutRevisionConflictError,
  SpatialNodeOwnershipConflictError,
  ParentCannotBeSlotError,
  InvalidParametricConfigError,
  ConcurrentHierarchyMutationError,
  InactiveLocationMappingError,
  DuplicateLocationMappingError,
  DuplicateSlotMappingError,
  IncompatibleLocationKindError,
  PublishedLayoutAlreadyExistsError,
  CannotDeleteNonDraftLayoutError,
  CannotModifyArchivedLayoutError,
  MalformedSupersededGeometryError,
} from '@ananya/inventory';
import { SpatialLayoutService } from './spatial-layout.service';
import type { GeneratedCompartment } from '@ananya/inventory';

describe('Spatial Layout Service Unit & Invariant Logic', () => {
  describe('Acknowledgment Signatures & Stale Invariant', () => {
    const baseCompartment: GeneratedCompartment = {
      slotId: 'slot-r0-c0',
      code: 'R0-C0',
      name: 'Bin R0-C0',
      kind: 'bin',
      logicalIndex: { row: 0, col: 0 },
      dimensions: { widthMm: 100, heightMm: 100, depthMm: 200 },
      clearDimensions: { widthMm: 90, heightMm: 90, depthMm: 190 },
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      metadata: {
        templateType: 'SMD_DRAWER_CABINET',
        origin: 'corner',
        row: 0,
        col: 0,
      },
    };

    it('generates deterministic signature for compartment topology change', () => {
      const sig1 = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Template topology changed',
      );
      const sig2 = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Template topology changed',
      );
      expect(sig1).toBe(sig2);
      expect(sig1).toContain('slot-r0-c0');
      expect(sig1).toContain('R0-C0');
      expect(sig1).toContain('bin');
      expect(sig1).toContain('SMD_DRAWER_CABINET');
    });

    it('produces identical signature when only dimensions vary', () => {
      const resizedCompartment: GeneratedCompartment = {
        ...baseCompartment,
        dimensions: { widthMm: 250, heightMm: 300, depthMm: 500 },
        clearDimensions: { widthMm: 240, heightMm: 290, depthMm: 490 },
      };

      const sigBase = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Dimension resized',
      );
      const sigResized = computeSlotAcknowledgmentSignature(
        resizedCompartment,
        'Dimension resized',
      );

      // Dimension-only changes do NOT alter the slot acknowledgment signature
      expect(sigBase).toBe(sigResized);
    });

    it('produces different signature when compartment kind or template changes', () => {
      const rackCompartment: GeneratedCompartment = {
        ...baseCompartment,
        kind: 'shelf',
        metadata: {
          templateType: 'PALLET_RACK',
          origin: 'corner',
          row: 0,
          col: 0,
        },
      };

      const sigBase = computeSlotAcknowledgmentSignature(
        baseCompartment,
        'Reason',
      );
      const sigRack = computeSlotAcknowledgmentSignature(
        rackCompartment,
        'Reason',
      );

      expect(sigBase).not.toBe(sigRack);
    });
  });

  describe('Incompatible Macro Compartment Kinds', () => {
    it('defines warehouse, room, building, facility, zone as incompatible for slots', () => {
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('warehouse');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('room');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('building');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('facility');
      expect(INCOMPATIBLE_COMPARTMENT_KINDS).toContain('zone');
    });
  });

  describe('Domain Error Contract Adherence', () => {
    it('SpatialLayoutNotFoundError provides correct code and id', () => {
      const err = new SpatialLayoutNotFoundError('layout-xyz');
      expect(err.code).toBe('SPATIAL_LAYOUT_NOT_FOUND');
      expect(err.layoutId).toBe('layout-xyz');
      expect(err.message).toContain('layout-xyz');
    });

    it('SpatialLayoutRevisionConflictError encapsulates current and expected revisions', () => {
      const err = new SpatialLayoutRevisionConflictError(
        5,
        4,
        'user-1',
        new Date('2026-10-01'),
      );
      expect(err.code).toBe('SPATIAL_LAYOUT_REVISION_CONFLICT');
      expect(err.currentRevision).toBe(5);
      expect(err.expectedRevision).toBe(4);
      expect(err.updatedBy).toBe('user-1');
      expect(err.updatedAt).toEqual(new Date('2026-10-01'));
    });

    it('SpatialNodeOwnershipConflictError encapsulates conflicting nodes', () => {
      const conflictingNodes = [
        {
          nodeId: 'node-1',
          locationId: 'loc-1',
          existingSource: 'cad',
          existingOwnerId: 'cad-import-run-1',
        },
      ];
      const err = new SpatialNodeOwnershipConflictError(conflictingNodes);
      expect(err.code).toBe('SPATIAL_NODE_OWNERSHIP_CONFLICT');
      expect(err.conflictingNodes).toEqual(conflictingNodes);
    });

    it('ParentCannotBeSlotError identifies parent location id and slot id', () => {
      const err = new ParentCannotBeSlotError('loc-parent', 'slot-1');
      expect(err.code).toBe('PARENT_CANNOT_BE_SLOT');
      expect(err.parentLocationId).toBe('loc-parent');
      expect(err.slotId).toBe('slot-1');
    });

    it('InvalidParametricConfigError contains validation errors', () => {
      const err = new InvalidParametricConfigError(['rows must be >= 1']);
      expect(err.code).toBe('INVALID_PARAMETRIC_CONFIG');
      expect(err.validationErrors).toEqual(['rows must be >= 1']);
    });

    it('ConcurrentHierarchyMutationError identifies missing location ids', () => {
      const err = new ConcurrentHierarchyMutationError(['loc-orphan']);
      expect(err.code).toBe('CONCURRENT_HIERARCHY_MUTATION');
      expect(err.invalidLocationIds).toEqual(['loc-orphan']);
    });

    it('InactiveLocationMappingError identifies inactive locations', () => {
      const err = new InactiveLocationMappingError(['loc-inactive']);
      expect(err.code).toBe('INACTIVE_LOCATION_MAPPING');
      expect(err.inactiveLocationIds).toEqual(['loc-inactive']);
    });

    it('DuplicateLocationMappingError identifies duplicated location id', () => {
      const err = new DuplicateLocationMappingError('loc-dup');
      expect(err.code).toBe('DUPLICATE_LOCATION_MAPPING');
      expect(err.locationId).toBe('loc-dup');
    });

    it('DuplicateSlotMappingError identifies duplicated slot id', () => {
      const err = new DuplicateSlotMappingError('slot-dup');
      expect(err.code).toBe('DUPLICATE_SLOT_MAPPING');
      expect(err.slotId).toBe('slot-dup');
    });

    it('IncompatibleLocationKindError identifies incompatible location kind', () => {
      const err = new IncompatibleLocationKindError('loc-1', 'warehouse');
      expect(err.code).toBe('INCOMPATIBLE_LOCATION_KIND');
      expect(err.locationId).toBe('loc-1');
      expect(err.kind).toBe('warehouse');
    });

    it('PublishedLayoutAlreadyExistsError identifies parent and conflicting layout', () => {
      const err = new PublishedLayoutAlreadyExistsError(
        'loc-p',
        'layout-1',
        'CAB-01',
      );
      expect(err.code).toBe('PUBLISHED_LAYOUT_ALREADY_EXISTS');
      expect(err.parentLocationId).toBe('loc-p');
      expect(err.existingLayoutId).toBe('layout-1');
      expect(err.existingLayoutCode).toBe('CAB-01');
    });

    it('CannotDeleteNonDraftLayoutError identifies layout id and non-draft status', () => {
      const err = new CannotDeleteNonDraftLayoutError('layout-1', 'PUBLISHED');
      expect(err.code).toBe('CANNOT_DELETE_NON_DRAFT_LAYOUT');
      expect(err.layoutId).toBe('layout-1');
      expect(err.status).toBe('PUBLISHED');
    });

    it('CannotModifyArchivedLayoutError identifies layout id and action', () => {
      const err = new CannotModifyArchivedLayoutError('layout-1', 'publish');
      expect(err.code).toBe('CANNOT_MODIFY_ARCHIVED_LAYOUT');
      expect(err.layoutId).toBe('layout-1');
      expect(err.message).toContain('publish');
    });

    it('MalformedSupersededGeometryError identifies node, location, and reason', () => {
      const err = new MalformedSupersededGeometryError(
        'node-123',
        'loc-456',
        'missing position coordinates',
      );
      expect(err.code).toBe('MALFORMED_SUPERSEDED_GEOMETRY');
      expect(err.nodeId).toBe('node-123');
      expect(err.locationId).toBe('loc-456');
      expect(err.reason).toBe('missing position coordinates');
      expect(err.message).toContain('node-123');
    });
  });

  describe('RFC-0069 Phase 4C — ContainerId-Authoritative Spatial Mapping Hierarchy', () => {
    interface MockLocationRow {
      id: string;
      code: string;
      kind: string;
      parentId?: string | null;
      containerId?: string | null;
      isActive?: boolean;
    }

    function createMockTx(getRows: () => MockLocationRow[]) {
      const lockedForShareBatches: string[][] = [];

      const mockTx: any = {
        _lockedForShareBatches: lockedForShareBatches,
        select: (fields: Record<string, any>) => {
          let filterIds: string[] | null = null;
          let isFalseCondition = false;
          let isOrdered = false;

          const builder: any = {
            from: (_table: any) => builder,
            where: (condition: any) => {
              if (condition && condition.queryChunks) {
                const extracted = condition.queryChunks.flatMap((ch: any) =>
                  Array.isArray(ch) ? ch.map((p: any) => p.value) : [],
                );
                if (extracted.length > 0) {
                  filterIds = extracted;
                } else {
                  isFalseCondition = true;
                }
              }
              return builder;
            },
            orderBy: (..._args: any[]) => {
              isOrdered = true;
              return builder;
            },
            for: (mode: string) => {
              if (mode === 'share' && filterIds) {
                lockedForShareBatches.push([...filterIds]);
              }
              return builder;
            },
            then: (resolve: (val: any) => any, reject?: (err: any) => any) => {
              try {
                if (isFalseCondition) {
                  return Promise.resolve([]).then(resolve, reject);
                }
                let rows = getRows();
                if (filterIds) {
                  rows = rows.filter((r) => filterIds!.includes(r.id));
                }
                if (isOrdered) {
                  rows = [...rows].sort((a, b) => a.id.localeCompare(b.id));
                }
                const mapped = rows.map((r) => {
                  const res: Record<string, any> = {};
                  for (const key of Object.keys(fields)) {
                    if (key === 'id') res.id = r.id;
                    else if (key === 'code') res.code = r.code;
                    else if (key === 'kind') res.kind = r.kind;
                    else if (key === 'parentId')
                      res.parentId = r.parentId ?? null;
                    else if (key === 'containerId')
                      res.containerId = r.containerId ?? null;
                    else if (key === 'isActive')
                      res.isActive = r.isActive ?? true;
                  }
                  return res;
                });
                return Promise.resolve(mapped).then(resolve, reject);
              } catch (e) {
                if (reject) return reject(e);
                throw e;
              }
            },
          };
          return builder;
        },
      };
      return mockTx;
    }

    const service = new SpatialLayoutService({} as any, {} as any, {} as any);

    const makeSlotMap = (
      slots: Array<{ slotId: string; kind: 'drawer' | 'bin' | 'shelf' }>,
    ) => {
      return new Map<string, GeneratedCompartment>(
        slots.map((s) => [
          s.slotId,
          {
            slotId: s.slotId,
            code: s.slotId,
            name: `Slot ${s.slotId}`,
            kind: s.kind,
            logicalIndex: { row: 0, col: 0 },
            dimensions: { widthMm: 100, heightMm: 100, depthMm: 100 },
            clearDimensions: { widthMm: 90, heightMm: 90, depthMm: 90 },
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            metadata: {
              templateType: 'SMD_DRAWER_CABINET',
              origin: 'corner',
              row: 0,
              col: 0,
            },
          },
        ]),
      );
    };

    it('A. Canonical physical hierarchy: Warehouse → Cabinet → Drawer → Bin', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'WH',
          code: 'WH',
          kind: 'warehouse',
          parentId: null,
          containerId: null,
        },
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: 'WH',
          containerId: 'WH',
        },
        {
          id: 'DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: 'CAB',
          containerId: 'CAB',
        },
        {
          id: 'BIN',
          code: 'BIN',
          kind: 'bin',
          parentId: 'DRW',
          containerId: 'DRW',
        },
      ];
      const tx = createMockTx(() => rows);
      const membership = await (service as any).lockAndVerifyHierarchy(
        tx,
        'CAB',
        ['DRW', 'BIN'],
      );
      expect(membership.has('DRW')).toBe(true);
      expect(membership.has('BIN')).toBe(true);
      expect(membership.has('CAB')).toBe(false);
      expect(membership.has('WH')).toBe(false);
    });

    it('B. Parent-only relationship: parentId exists, containerId NULL: mapping rejected', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'BIN',
          code: 'BIN',
          kind: 'bin',
          parentId: 'CAB',
          containerId: null,
        },
      ];
      const tx = createMockTx(() => rows);
      await expect(
        (service as any).lockAndVerifyHierarchy(tx, 'CAB', ['BIN']),
      ).rejects.toBeInstanceOf(ConcurrentHierarchyMutationError);
    });

    it('C. Parent/container divergence: parentId = A, containerId = B: mapping follows B', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'CAB_A',
          code: 'CAB-A',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'CAB_B',
          code: 'CAB-B',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: 'CAB_A',
          containerId: 'CAB_B',
        },
      ];
      const txB = createMockTx(() => rows);
      const membershipB = await (service as any).lockAndVerifyHierarchy(
        txB,
        'CAB_B',
        ['DRW'],
      );
      expect(membershipB.has('DRW')).toBe(true);

      const txA = createMockTx(() => rows);
      await expect(
        (service as any).lockAndVerifyHierarchy(txA, 'CAB_A', ['DRW']),
      ).rejects.toBeInstanceOf(ConcurrentHierarchyMutationError);
    });

    it('D. Invalid legacy relationship: cabinet → bin with containerId NULL cannot be mapped', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: 'WH',
          containerId: null,
        },
        {
          id: 'BIN',
          code: 'BIN',
          kind: 'bin',
          parentId: 'CAB',
          containerId: null,
        },
      ];
      const tx = createMockTx(() => rows);
      const slotMap = makeSlotMap([{ slotId: 'slot-1', kind: 'bin' }]);

      await expect(
        (service as any).validateMappingsHierarchyAndActivity(
          tx,
          'CAB',
          [{ slotId: 'slot-1', locationId: 'BIN' }],
          slotMap,
        ),
      ).rejects.toBeInstanceOf(ConcurrentHierarchyMutationError);
    });

    it('E. Context root: Warehouse → Cabinet/Rack remains valid', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'WH',
          code: 'WH',
          kind: 'warehouse',
          parentId: null,
          containerId: null,
        },
        {
          id: 'RACK',
          code: 'RACK',
          kind: 'rack',
          parentId: 'WH',
          containerId: 'WH',
        },
        {
          id: 'SHELF',
          code: 'SHELF',
          kind: 'shelf',
          parentId: 'RACK',
          containerId: 'RACK',
        },
      ];
      const tx = createMockTx(() => rows);
      const membership = await (service as any).lockAndVerifyHierarchy(
        tx,
        'RACK',
        ['SHELF'],
      );
      expect(membership.has('SHELF')).toBe(true);
    });

    it('F. Transaction locking: locks follow containerId ancestry, not parentId ancestry', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'ORG_PARENT',
          code: 'ORG',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'PHYS_CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'PHYS_DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: 'ORG_PARENT',
          containerId: 'PHYS_CAB',
        },
        {
          id: 'PHYS_BIN',
          code: 'BIN',
          kind: 'bin',
          parentId: 'ORG_PARENT',
          containerId: 'PHYS_DRW',
        },
      ];
      const tx = createMockTx(() => rows);
      await (service as any).lockAndVerifyHierarchy(tx, 'PHYS_CAB', [
        'PHYS_BIN',
      ]);

      // tx._lockedForShareBatches records all batches of IDs locked FOR SHARE
      // Batch 1: chain lock taken in step (c)
      const chainLockBatch = tx._lockedForShareBatches[0];
      expect(chainLockBatch).toBeDefined();
      // Must lock the physical chain: PHYS_BIN and PHYS_DRW in deterministic sorted order
      expect(chainLockBatch).toEqual(['PHYS_BIN', 'PHYS_DRW'].sort());
      // Must NOT lock the organizational parent
      expect(chainLockBatch).not.toContain('ORG_PARENT');
    });

    it('G. Physical reparent: changing containerId ancestry causes validation failure', async () => {
      let rows: MockLocationRow[] = [
        {
          id: 'CAB1',
          code: 'CAB1',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'CAB2',
          code: 'CAB2',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: null,
          containerId: 'CAB1',
        },
      ];
      const tx1 = createMockTx(() => rows);
      const membership1 = await (service as any).lockAndVerifyHierarchy(
        tx1,
        'CAB1',
        ['DRW'],
      );
      expect(membership1.has('DRW')).toBe(true);

      // Reparent DRW containerId to CAB2
      rows = [
        {
          id: 'CAB1',
          code: 'CAB1',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'CAB2',
          code: 'CAB2',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: null,
          containerId: 'CAB2',
        },
      ];
      const tx2 = createMockTx(() => rows);
      await expect(
        (service as any).lockAndVerifyHierarchy(tx2, 'CAB1', ['DRW']),
      ).rejects.toBeInstanceOf(ConcurrentHierarchyMutationError);
    });

    it('H. Organizational reparent: changing parentId alone does not invalidate physical mapping', async () => {
      let rows: MockLocationRow[] = [
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: 'ORG1',
          containerId: null,
        },
        {
          id: 'DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: 'ORG1',
          containerId: 'CAB',
        },
      ];
      const tx1 = createMockTx(() => rows);
      const membership1 = await (service as any).lockAndVerifyHierarchy(
        tx1,
        'CAB',
        ['DRW'],
      );
      expect(membership1.has('DRW')).toBe(true);

      // Change parentId to ORG2 while containerId remains CAB
      rows = [
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: 'ORG1',
          containerId: null,
        },
        {
          id: 'DRW',
          code: 'DRW',
          kind: 'drawer',
          parentId: 'ORG2',
          containerId: 'CAB',
        },
      ];
      const tx2 = createMockTx(() => rows);
      const membership2 = await (service as any).lockAndVerifyHierarchy(
        tx2,
        'CAB',
        ['DRW'],
      );
      expect(membership2.has('DRW')).toBe(true);
    });

    it('I. Existing published mappings: all current valid mappings continue to validate', async () => {
      const rows: MockLocationRow[] = [
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'DRW1',
          code: 'DRW1',
          kind: 'drawer',
          parentId: 'CAB',
          containerId: 'CAB',
        },
        {
          id: 'DRW2',
          code: 'DRW2',
          kind: 'drawer',
          parentId: 'CAB',
          containerId: 'CAB',
        },
        {
          id: 'BIN1',
          code: 'BIN1',
          kind: 'bin',
          parentId: 'DRW1',
          containerId: 'DRW1',
        },
      ];
      const tx = createMockTx(() => rows);
      const membership = await (service as any).lockAndVerifyHierarchy(
        tx,
        'CAB',
        ['DRW1', 'DRW2', 'BIN1'],
      );
      expect(membership.has('DRW1')).toBe(true);
      expect(membership.has('DRW2')).toBe(true);
      expect(membership.has('BIN1')).toBe(true);
    });

    it('J. Concurrency & cycle-safety: locks sorted deterministically and terminates on cycles', async () => {
      const cyclicRows: MockLocationRow[] = [
        {
          id: 'CAB',
          code: 'CAB',
          kind: 'cabinet',
          parentId: null,
          containerId: null,
        },
        {
          id: 'A',
          code: 'A',
          kind: 'drawer',
          parentId: null,
          containerId: 'B',
        },
        {
          id: 'B',
          code: 'B',
          kind: 'drawer',
          parentId: null,
          containerId: 'A',
        },
      ];
      const tx = createMockTx(() => cyclicRows);
      // Traversal terminates without infinite loop, failing closed
      await expect(
        (service as any).lockAndVerifyHierarchy(tx, 'CAB', ['A']),
      ).rejects.toBeInstanceOf(ConcurrentHierarchyMutationError);
    });
  });
});
