import { InventoryProjectionsService } from './inventory-projections.service';
import type {
  InventoryProjection,
  InventoryProjectionRepository,
  InventoryTransactionRepository,
  LocationRepository,
  Location,
} from '@ananya/inventory';
import {
  InventoryProjection as InventoryProjectionAggregate,
  Location as LocationAggregate,
} from '@ananya/inventory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MakeLocationOptions {
  parentId?: string | null;
  containerId?: string | null;
  kind?: string;
}

/**
 * RFC-0069 Phase 4: physical stock rollup follows PHYSICAL containment
 * (`containerId`). Fixtures therefore carry a canonical `kind` and an explicit
 * `containerId`; `parentId` is the organizational relation and only falls back
 * to a physical container while its pair is physically valid.
 */
function makeLocation(
  id: string,
  code: string,
  options: MakeLocationOptions = {},
): Location {
  return LocationAggregate.rehydrate({
    id,
    code,
    name: code,
    kind: options.kind ?? 'bin',
    parentId: options.parentId ?? null,
    containerId: options.containerId ?? null,
    isActive: true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeProjection(
  componentId: string,
  locationId: string,
): InventoryProjection {
  return InventoryProjectionAggregate.create({
    id: `proj-${componentId}-${locationId}`,
    componentId,
    locationId,
    quantity: 10,
    unitOfMeasure: 'pcs',
    lastUpdated: new Date(),
  });
}

function createMockProjectionRepo(
  projections: InventoryProjection[],
): InventoryProjectionRepository {
  return {
    findById: jest.fn(),
    findByComponentAndLocation: jest.fn(),
    findManyByComponent: jest.fn(),
    findManyByLocation: jest
      .fn()
      .mockImplementation((locationId: string) =>
        Promise.resolve(projections.filter((p) => p.locationId === locationId)),
      ),
    findManyByLocations: jest
      .fn()
      .mockImplementation((locationIds: string[]) =>
        Promise.resolve(
          projections.filter((p) => locationIds.includes(p.locationId)),
        ),
      ),
    save: jest.fn(),
    delete: jest.fn(),
    deleteByComponentAndLocation: jest.fn(),
  };
}

function createMockLocationRepo(locations: Location[]): LocationRepository {
  return {
    findById: jest.fn(),
    findByCode: jest.fn(),
    findByParentId: jest.fn(),
    findAncestorIds: jest.fn().mockResolvedValue([]),
    findContainerAncestorIds: jest.fn().mockResolvedValue([]),
    findMany: jest.fn().mockResolvedValue(locations),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    isInUse: jest.fn(),
  };
}

function createMockTransactionRepo(): InventoryTransactionRepository {
  return {
    findById: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
  };
}

function createService(
  projections: InventoryProjection[],
  locations: Location[],
): InventoryProjectionsService {
  const projRepo = createMockProjectionRepo(projections);
  const txRepo = createMockTransactionRepo();
  const locRepo = createMockLocationRepo(locations);
  return new InventoryProjectionsService(projRepo, txRepo, locRepo);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InventoryProjectionsService.getByLocation (physical rollup)', () => {
  it('Case 1: direct component — container → component', async () => {
    const locA = makeLocation('A', 'LOC-A', { kind: 'cabinet' });
    const proj = makeProjection('comp-1', 'A');

    const service = createService([proj], [locA]);
    const result = await service.getByLocation('A');

    expect(result).toHaveLength(1);
    expect(result[0]!.componentId).toBe('comp-1');
  });

  it('Case 2: one physical level — cabinet → drawer → component', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [cab, drw]);

    const resultCab = await service.getByLocation('A');
    expect(resultCab).toHaveLength(1);
    expect(resultCab[0]!.componentId).toBe('comp-1');

    const resultDrw = await service.getByLocation('B');
    expect(resultDrw).toHaveLength(1);
    expect(resultDrw[0]!.componentId).toBe('comp-1');
  });

  it('Case 3: two physical levels — cabinet → drawer → bin → component', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const bin = makeLocation('C', 'BIN', { kind: 'bin', containerId: 'B' });
    const proj = makeProjection('comp-1', 'C');

    const service = createService([proj], [cab, drw, bin]);

    for (const locId of ['A', 'B', 'C']) {
      const result = await service.getByLocation(locId);
      expect(result).toHaveLength(1);
      expect(result[0]!.componentId).toBe('comp-1');
    }
  });

  it('Case 4: three physical levels — cabinet → drawer → bin → compartment', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const bin = makeLocation('C', 'BIN', { kind: 'bin', containerId: 'B' });
    const cmp = makeLocation('D', 'CMP', {
      kind: 'compartment',
      containerId: 'C',
    });
    const proj = makeProjection('comp-1', 'D');

    const service = createService([proj], [cab, drw, bin, cmp]);

    for (const locId of ['A', 'B', 'C', 'D']) {
      const result = await service.getByLocation(locId);
      expect(result).toHaveLength(1);
      expect(result[0]!.componentId).toBe('comp-1');
    }
  });

  it('Case 5: mixed depths — components at different physical levels', async () => {
    // cabinet
    // ├── comp-1
    // └── drawer
    //     ├── comp-2
    //     └── bin
    //         └── comp-3
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const bin = makeLocation('C', 'BIN', { kind: 'bin', containerId: 'B' });

    const proj1 = makeProjection('comp-1', 'A');
    const proj2 = makeProjection('comp-2', 'B');
    const proj3 = makeProjection('comp-3', 'C');

    const service = createService([proj1, proj2, proj3], [cab, drw, bin]);

    const resultA = await service.getByLocation('A');
    expect(resultA).toHaveLength(3);
    expect(resultA.map((p) => p.componentId).sort()).toEqual([
      'comp-1',
      'comp-2',
      'comp-3',
    ]);

    const resultB = await service.getByLocation('B');
    expect(resultB).toHaveLength(2);
    expect(resultB.map((p) => p.componentId).sort()).toEqual([
      'comp-2',
      'comp-3',
    ]);

    const resultC = await service.getByLocation('C');
    expect(resultC).toHaveLength(1);
    expect(resultC[0]!.componentId).toBe('comp-3');
  });

  it('does not duplicate components within a location result', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [cab, drw]);
    const result = await service.getByLocation('A');

    const compIds = result.map((p) => p.componentId);
    expect(compIds.filter((id) => id === 'comp-1')).toHaveLength(1);
  });

  it('returns empty array for a leaf location with no components', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });

    const service = createService([], [cab, drw]);
    const result = await service.getByLocation('B');

    expect(result).toEqual([]);
  });

  it('handles a standalone top-level physical location with no children', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const proj = makeProjection('comp-1', 'A');

    const service = createService([proj], [cab]);
    const result = await service.getByLocation('A');

    expect(result).toHaveLength(1);
    expect(result[0]!.componentId).toBe('comp-1');
  });

  // -------------------------------------------------------------------------
  // RFC-0069 Phase 4 regression tests
  // -------------------------------------------------------------------------

  it('organizational parent WITHOUT containerId does NOT create a physical rollup across an invalid edge', async () => {
    // cabinet organizationally contains a bin. `cabinet → bin` is NOT canonical,
    // so it must NOT create a physical rollup.
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const bin = makeLocation('B', 'BIN', { kind: 'bin', parentId: 'A' });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [cab, bin]);

    // From the cabinet, the organizationally-nested bin must NOT roll up.
    expect(await service.getByLocation('A')).toEqual([]);

    // The bin still sees its own stock.
    expect(await service.getByLocation('B')).toHaveLength(1);
  });

  it('organizational parent does NOT roll up across shelf → shelf', async () => {
    const s1 = makeLocation('A', 'S1', { kind: 'shelf' });
    const s2 = makeLocation('B', 'S2', { kind: 'shelf', parentId: 'A' });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [s1, s2]);
    expect(await service.getByLocation('A')).toEqual([]);
  });

  it('valid containerId DOES create a physical rollup', async () => {
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    // containerId set explicitly; parentId is a physically-invalid edge.
    const bin = makeLocation('B', 'BIN', {
      kind: 'bin',
      parentId: 'A',
      containerId: 'A',
    });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [cab, bin]);
    const result = await service.getByLocation('A');
    expect(result).toHaveLength(1);
    expect(result[0]!.componentId).toBe('comp-1');
  });

  it('organizational parent WITHOUT containerId does NOT create a physical rollup (even for canonical pair)', async () => {
    // cabinet → drawer is canonical organizationally, but containerId is NULL.
    // Under Phase 4A containerId-authoritative rollup, the drawer does NOT roll up into the cabinet.
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', {
      kind: 'drawer',
      parentId: 'A',
      containerId: null,
    });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [cab, drw]);
    expect(await service.getByLocation('A')).toEqual([]);
    expect(await service.getByLocation('B')).toHaveLength(1);
  });

  it('parent/container divergence: physical rollup follows containerId, NOT parentId', async () => {
    const orgRoot = makeLocation('ORG', 'ORG-ROOT', { kind: 'warehouse' });
    const physRoot = makeLocation('PHYS', 'PHYS-CAB', { kind: 'cabinet' });
    const drw = makeLocation('DRW', 'DRW', {
      kind: 'drawer',
      parentId: 'ORG',
      containerId: 'PHYS',
    });
    const proj = makeProjection('comp-1', 'DRW');

    const service = createService([proj], [orgRoot, physRoot, drw]);

    // Rollup from organizational parent contains nothing
    expect(await service.getByLocation('ORG')).toEqual([]);

    // Rollup from physical container contains the projection
    const physResult = await service.getByLocation('PHYS');
    expect(physResult).toHaveLength(1);
    expect(physResult[0]!.componentId).toBe('comp-1');
  });

  it('context root (warehouse) rolls up physical descendants via containerId', async () => {
    const wh = makeLocation('WH', 'WH', { kind: 'warehouse' });
    const cab = makeLocation('CAB', 'CAB', {
      kind: 'cabinet',
      containerId: 'WH',
    });
    const drw = makeLocation('DRW', 'DRW', {
      kind: 'drawer',
      containerId: 'CAB',
    });
    const proj = makeProjection('comp-1', 'DRW');

    const service = createService([proj], [wh, cab, drw]);
    const result = await service.getByLocation('WH');
    expect(result).toHaveLength(1);
    expect(result[0]!.componentId).toBe('comp-1');
  });

  it('architecture constraint: fails if getByLocation reverts to parentId', async () => {
    // Location has canonical parentId 'A', but containerId is null.
    // If getByLocation reverted to parentId, getByLocation('A') would return 1 item.
    // Under RFC-0069 Phase 4A, it MUST return [].
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', {
      kind: 'drawer',
      parentId: 'A',
      containerId: null,
    });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [cab, drw]);
    expect(await service.getByLocation('A')).toEqual([]);
  });

  it('mixed organizational and physical hierarchies behave correctly', async () => {
    const wh = makeLocation('WH', 'WH', { kind: 'warehouse' });
    // Physically in the warehouse; organizationally unparented.
    const cab = makeLocation('CAB', 'CAB', {
      kind: 'cabinet',
      containerId: 'WH',
    });
    // Organizationally under the warehouse, physically in the cabinet.
    const drw = makeLocation('DRW', 'DRW', {
      kind: 'drawer',
      parentId: 'WH',
      containerId: 'CAB',
    });
    const proj = makeProjection('comp-1', 'DRW');

    const service = createService([proj], [wh, cab, drw]);

    // Warehouse physically contains the cabinet, which contains the drawer.
    expect(await service.getByLocation('WH')).toHaveLength(1);
    expect(await service.getByLocation('CAB')).toHaveLength(1);
  });

  it('cycles cannot cause infinite traversal', async () => {
    // Malformed: A physically contains B and B physically contains A.
    const a = makeLocation('A', 'CAB', { kind: 'cabinet', containerId: 'B' });
    const b = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [a, b]);
    const result = await service.getByLocation('A');

    // Terminates and includes the projection exactly once, without looping.
    expect(result).toHaveLength(1);
  });

  it('existing stock totals remain unchanged for currently valid physical relationships', async () => {
    // A canonical chain expressed with containerId must return exactly the same
    // set as it did under the previous parentId-only rollup.
    const cab = makeLocation('A', 'CAB', { kind: 'cabinet' });
    const drw = makeLocation('B', 'DRW', { kind: 'drawer', containerId: 'A' });
    const bin = makeLocation('C', 'BIN', { kind: 'bin', containerId: 'B' });

    const projections = [
      makeProjection('comp-1', 'A'),
      makeProjection('comp-2', 'B'),
      makeProjection('comp-3', 'C'),
    ];

    const service = createService(projections, [cab, drw, bin]);
    const result = await service.getByLocation('A');

    expect(result).toHaveLength(3);
    expect(result.map((p) => p.componentId).sort()).toEqual([
      'comp-1',
      'comp-2',
      'comp-3',
    ]);
  });
});
