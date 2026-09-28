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

function makeLocation(
  id: string,
  code: string,
  parentId: string | null = null,
): Location {
  return LocationAggregate.rehydrate({
    id,
    code,
    name: code,
    kind: 'bin',
    parentId,
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

describe('InventoryProjectionsService.getByLocation', () => {
  it('Case 1: direct component — A → Component', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const proj = makeProjection('comp-1', 'A');

    const service = createService([proj], [locA]);
    const result = await service.getByLocation('A');

    expect(result).toHaveLength(1);
    expect(result[0]!.componentId).toBe('comp-1');
  });

  it('Case 2: one child level — A → B → Component', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const locB = makeLocation('B', 'LOC-B', 'A');
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [locA, locB]);

    // From A: should include B's component
    const resultA = await service.getByLocation('A');
    expect(resultA).toHaveLength(1);
    expect(resultA[0]!.componentId).toBe('comp-1');

    // From B: should include its own component
    const resultB = await service.getByLocation('B');
    expect(resultB).toHaveLength(1);
    expect(resultB[0]!.componentId).toBe('comp-1');
  });

  it('Case 3: two child levels — A → B → C → Component', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const locB = makeLocation('B', 'LOC-B', 'A');
    const locC = makeLocation('C', 'LOC-C', 'B');
    const proj = makeProjection('comp-1', 'C');

    const service = createService([proj], [locA, locB, locC]);

    const resultA = await service.getByLocation('A');
    expect(resultA).toHaveLength(1);
    expect(resultA[0]!.componentId).toBe('comp-1');

    const resultB = await service.getByLocation('B');
    expect(resultB).toHaveLength(1);
    expect(resultB[0]!.componentId).toBe('comp-1');

    const resultC = await service.getByLocation('C');
    expect(resultC).toHaveLength(1);
    expect(resultC[0]!.componentId).toBe('comp-1');
  });

  it('Case 4: three child levels — A → B → C → D → Component', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const locB = makeLocation('B', 'LOC-B', 'A');
    const locC = makeLocation('C', 'LOC-C', 'B');
    const locD = makeLocation('D', 'LOC-D', 'C');
    const proj = makeProjection('comp-1', 'D');

    const service = createService([proj], [locA, locB, locC, locD]);

    for (const locId of ['A', 'B', 'C', 'D']) {
      const result = await service.getByLocation(locId);
      expect(result).toHaveLength(1);
      expect(result[0]!.componentId).toBe('comp-1');
    }
  });

  it('Case 5: mixed depths — components at different levels', async () => {
    // A
    // ├── comp-1
    // └── B
    //     ├── comp-2
    //     └── C
    //         └── comp-3
    const locA = makeLocation('A', 'LOC-A');
    const locB = makeLocation('B', 'LOC-B', 'A');
    const locC = makeLocation('C', 'LOC-C', 'B');

    const proj1 = makeProjection('comp-1', 'A');
    const proj2 = makeProjection('comp-2', 'B');
    const proj3 = makeProjection('comp-3', 'C');

    const service = createService([proj1, proj2, proj3], [locA, locB, locC]);

    // A sees all three
    const resultA = await service.getByLocation('A');
    expect(resultA).toHaveLength(3);
    const compIdsA = resultA.map((p) => p.componentId).sort();
    expect(compIdsA).toEqual(['comp-1', 'comp-2', 'comp-3']);

    // B sees comp-2 and comp-3
    const resultB = await service.getByLocation('B');
    expect(resultB).toHaveLength(2);
    const compIdsB = resultB.map((p) => p.componentId).sort();
    expect(compIdsB).toEqual(['comp-2', 'comp-3']);

    // C sees only comp-3
    const resultC = await service.getByLocation('C');
    expect(resultC).toHaveLength(1);
    expect(resultC[0]!.componentId).toBe('comp-3');
  });

  it('does not duplicate components within a location result', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const locB = makeLocation('B', 'LOC-B', 'A');
    // comp-1 appears only at B
    const proj = makeProjection('comp-1', 'B');

    const service = createService([proj], [locA, locB]);
    const result = await service.getByLocation('A');

    // comp-1 should appear exactly once
    const compIds = result.map((p) => p.componentId);
    expect(compIds.filter((id) => id === 'comp-1')).toHaveLength(1);
  });

  it('returns empty array for a leaf location with no components', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const locB = makeLocation('B', 'LOC-B', 'A');

    const service = createService([], [locA, locB]);
    const result = await service.getByLocation('B');

    expect(result).toEqual([]);
  });

  it('handles a standalone root location with no children', async () => {
    const locA = makeLocation('A', 'LOC-A');
    const proj = makeProjection('comp-1', 'A');

    const service = createService([proj], [locA]);
    const result = await service.getByLocation('A');

    expect(result).toHaveLength(1);
    expect(result[0]!.componentId).toBe('comp-1');
  });
});
