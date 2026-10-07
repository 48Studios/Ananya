/* eslint-disable @typescript-eslint/unbound-method */
import { SpatialService } from './spatial.service';
import {
  SpatialModel,
  SpatialAnchor,
  SpatialNode,
  Location,
  type SpatialModelRepository,
  type SpatialAnchorRepository,
  type SpatialNodeRepository,
  type LocationRepository,
  SpatialModelNotFoundError,
  SpatialModelInUseError,
  SpatialAnchorDoesNotBelongToModelError,
  SpatialNodeCannotParentToSelfError,
  SpatialHierarchyCycleError,
  SpatialHierarchyLocationMismatchError,
  LocationNotFoundError,
  SpatialAnchorAlreadyOccupiedError,
  SpatialNodeHasChildrenError,
  SpatialModelConflictError,
  SpatialAnchorConflictError,
  InvalidSpatialAnchorCodeError,
} from '@ananya/inventory';
import type { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';
import type { SpatialLayoutRepository } from '@ananya/inventory';
import type { SpatialLayoutWithMappings } from '@ananya/inventory';

function makePublishedLayout(
  parentLocationId: string,
): SpatialLayoutWithMappings {
  return {
    id: 'layout-published-1',
    parentLocationId,
    code: 'CAB-LAYOUT',
    name: 'Cabinet layout',
    description: null,
    templateType: 'SMD_DRAWER_CABINET',
    engineVersion: '1.0.0',
    config: {
      templateType: 'SMD_DRAWER_CABINET',
      dimensions: { widthMm: 720, heightMm: 900, depthMm: 300 },
      wallThicknessMm: 12,
      rows: 2,
      columns: 2,
    },
    revision: 3,
    status: 'PUBLISHED',
    totalCompartments: 4,
    metadata: {},
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mappings: [],
  } as unknown as SpatialLayoutWithMappings;
}

function makeLocation(
  id: string,
  code: string,
  parentId: string | null = null,
): Location {
  return Location.rehydrate({
    id,
    code,
    name: `Location ${code}`,
    kind: parentId ? 'drawer' : 'cabinet',
    parentId,
    containerId: null,
    isActive: true,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('SpatialService', () => {
  let service: SpatialService;
  let modelRepo: jest.Mocked<SpatialModelRepository>;
  let anchorRepo: jest.Mocked<SpatialAnchorRepository>;
  let nodeRepo: jest.Mocked<SpatialNodeRepository>;
  let locationRepo: jest.Mocked<LocationRepository>;
  let layoutRepo: jest.Mocked<SpatialLayoutRepository>;
  let mockProjectionsService: {
    getByLocation: jest.Mock;
    getByComponent: jest.Mock;
  };

  beforeEach(() => {
    modelRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      findMany: jest.fn(),
      save: jest.fn().mockImplementation((m) => Promise.resolve(m)),
      update: jest.fn().mockImplementation((m) => Promise.resolve(m)),
      delete: jest.fn().mockResolvedValue(undefined),
      isInUse: jest.fn().mockResolvedValue(false),
    };

    anchorRepo = {
      findById: jest.fn(),
      findByModelId: jest.fn(),
      findByModelAndCode: jest.fn(),
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      update: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    nodeRepo = {
      findById: jest.fn(),
      findByLocationId: jest.fn(),
      findByParentId: jest.fn(),
      findByAnchorId: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((n) => Promise.resolve(n)),
      update: jest.fn().mockImplementation((n) => Promise.resolve(n)),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    locationRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      findByParentId: jest.fn().mockResolvedValue([]),
      findAncestorIds: jest.fn().mockResolvedValue([]),
      findContainerAncestorIds: jest.fn().mockResolvedValue([]),
      findMany: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      isInUse: jest.fn().mockResolvedValue(false),
    };

    mockProjectionsService = {
      getByLocation: jest.fn().mockResolvedValue([]),
      getByComponent: jest.fn().mockResolvedValue([]),
    };

    layoutRepo = {
      findById: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      findByParentLocationId: jest.fn().mockResolvedValue([]),
      findActiveByParentLocationId: jest.fn().mockResolvedValue(null),
      findMappingsByLocationId: jest.fn().mockResolvedValue([]),
      findRevisions: jest.fn().mockResolvedValue([]),
      findRevisionByNumber: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    service = new SpatialService(
      modelRepo,
      anchorRepo,
      nodeRepo,
      locationRepo,
      layoutRepo,
      mockProjectionsService as unknown as InventoryProjectionsService,
      (op) => op({ modelRepo, anchorRepo, nodeRepo }),
    );
  });

  describe('Spatial Models', () => {
    it('creates a spatial model with valid dimensions', async () => {
      const model = await service.createModel({
        code: 'CAB-60D',
        name: '60 Drawer Cabinet',
        widthMm: 310,
        heightMm: 550,
        depthMm: 160,
      });

      expect(model.code).toBe('CAB-60D');
      expect(model.widthMm).toBe(310);
      expect(modelRepo.save).toHaveBeenCalledTimes(1);
    });

    it('retrieves an existing model or throws SpatialModelNotFoundError', async () => {
      modelRepo.findById.mockResolvedValueOnce(null);
      await expect(service.getModel('non-existent')).rejects.toThrow(
        SpatialModelNotFoundError,
      );

      const existing = SpatialModel.create({
        code: 'RACK-01',
        name: 'Rack',
        widthMm: 1000,
        heightMm: 2000,
        depthMm: 800,
      });
      modelRepo.findById.mockResolvedValueOnce(existing);

      const found = await service.getModel(existing.id);
      expect(found.code).toBe('RACK-01');
    });

    it('prevents deletion of a model that is in use by placed spatial nodes', async () => {
      const existing = SpatialModel.create({
        code: 'CAB-01',
        name: 'Cabinet',
        widthMm: 500,
        heightMm: 500,
        depthMm: 500,
      });
      modelRepo.findById.mockResolvedValue(existing);
      modelRepo.isInUse.mockResolvedValue(true);

      await expect(service.deleteModel(existing.id)).rejects.toThrow(
        SpatialModelInUseError,
      );
      expect(modelRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('Spatial Anchors', () => {
    it('creates an anchor on an existing model', async () => {
      const model = SpatialModel.create({
        code: 'CAB-01',
        name: 'Cabinet',
        widthMm: 500,
        heightMm: 500,
        depthMm: 500,
      });
      modelRepo.findById.mockResolvedValue(model);

      const anchor = await service.createAnchor(model.id, {
        code: 'DRAWER-A1',
        name: 'Drawer A1',
        localPositionX: 50,
        localPositionY: 100,
        localPositionZ: 0,
      });

      expect(anchor.modelId).toBe(model.id);
      expect(anchor.code).toBe('DRAWER-A1');
      expect(anchor.localPositionX).toBe(50);
      expect(anchorRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rejects creating an anchor if the model does not exist', async () => {
      modelRepo.findById.mockResolvedValue(null);

      await expect(
        service.createAnchor('missing-model', {
          code: 'DRAWER-A1',
          name: 'Drawer A1',
        }),
      ).rejects.toThrow(SpatialModelNotFoundError);
    });
  });

  describe('Spatial Nodes & Location Association', () => {
    it('creates a spatial node mapped to a valid location', async () => {
      const location = makeLocation('loc-cabinet', 'CAB-A');
      locationRepo.findById.mockResolvedValue(location);
      nodeRepo.findByLocationId.mockResolvedValue(null);

      const node = await service.createNode({
        locationId: location.id,
        positionX: 5000,
        positionY: 0,
        positionZ: 2500,
      });

      expect(node.locationId).toBe(location.id);
      expect(node.positionX).toBe(5000);
      expect(nodeRepo.save).toHaveBeenCalledTimes(1);
    });

    it('throws LocationNotFoundError if location does not exist', async () => {
      locationRepo.findById.mockResolvedValue(null);

      await expect(
        service.createNode({
          locationId: 'missing-loc',
        }),
      ).rejects.toThrow(LocationNotFoundError);
    });

    it('enforces 1:1 by rejecting a second spatial node for the same location', async () => {
      const location = makeLocation('loc-cabinet', 'CAB-A');
      locationRepo.findById.mockResolvedValue(location);

      const existingNode = SpatialNode.create({
        locationId: location.id,
      });
      nodeRepo.findByLocationId.mockResolvedValue(existingNode);

      await expect(
        service.createNode({
          locationId: location.id,
        }),
      ).rejects.toThrow('already has a spatial representation');
    });

    it('rejects an anchor that does not belong to the node model', async () => {
      const location = makeLocation('loc-1', 'LOC-1');
      locationRepo.findById.mockResolvedValue(location);
      nodeRepo.findByLocationId.mockResolvedValue(null);

      const modelA = SpatialModel.create({
        code: 'MOD-A',
        name: 'Model A',
        widthMm: 100,
        heightMm: 100,
        depthMm: 100,
      });
      const modelB = SpatialModel.create({
        code: 'MOD-B',
        name: 'Model B',
        widthMm: 100,
        heightMm: 100,
        depthMm: 100,
      });

      const anchorOnModelB = SpatialAnchor.create({
        modelId: modelB.id,
        code: 'ANCHOR-1',
        name: 'Anchor 1',
      });

      modelRepo.findById.mockResolvedValue(modelA);
      anchorRepo.findById.mockResolvedValue(anchorOnModelB);

      await expect(
        service.createNode({
          locationId: location.id,
          modelId: modelA.id,
          anchorId: anchorOnModelB.id,
        }),
      ).rejects.toThrow(SpatialAnchorDoesNotBelongToModelError);
    });

    it('allows child node to bind to an anchor on parent node model', async () => {
      const parentLoc = makeLocation('loc-cab', 'CAB-1');
      const childLoc = makeLocation('loc-drw', 'DRW-1', parentLoc.id);

      locationRepo.findById.mockImplementation((id: string) => {
        if (id === parentLoc.id) return Promise.resolve(parentLoc);
        if (id === childLoc.id) return Promise.resolve(childLoc);
        return Promise.resolve(null);
      });
      locationRepo.findMany.mockResolvedValue([parentLoc, childLoc]);

      const cabModel = SpatialModel.create({
        code: 'CAB-MOD',
        name: 'Cabinet Model',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 500,
      });
      const anchorA1 = SpatialAnchor.create({
        modelId: cabModel.id,
        code: 'A01',
        name: 'Anchor A01',
      });

      const parentNode = SpatialNode.create({
        locationId: parentLoc.id,
        modelId: cabModel.id,
      });

      nodeRepo.findByLocationId.mockResolvedValue(null);
      nodeRepo.findById.mockResolvedValue(parentNode);
      nodeRepo.findByParentId.mockResolvedValue([]);
      anchorRepo.findById.mockResolvedValue(anchorA1);

      const childNode = await service.createNode({
        locationId: childLoc.id,
        parentSpatialNodeId: parentNode.id,
        anchorId: anchorA1.id,
      });

      expect(childNode.parentSpatialNodeId).toBe(parentNode.id);
      expect(childNode.anchorId).toBe(anchorA1.id);
    });

    it('rejects anchor if already occupied by another sibling under the same parent', async () => {
      const parentLoc = makeLocation('loc-cab', 'CAB-1');
      const child1Loc = makeLocation('loc-drw-1', 'DRW-1', parentLoc.id);
      const child2Loc = makeLocation('loc-drw-2', 'DRW-2', parentLoc.id);

      locationRepo.findById.mockImplementation((id: string) => {
        if (id === parentLoc.id) return Promise.resolve(parentLoc);
        if (id === child1Loc.id) return Promise.resolve(child1Loc);
        if (id === child2Loc.id) return Promise.resolve(child2Loc);
        return Promise.resolve(null);
      });
      locationRepo.findMany.mockResolvedValue([
        parentLoc,
        child1Loc,
        child2Loc,
      ]);

      const cabModel = SpatialModel.create({
        code: 'CAB-MOD',
        name: 'Cabinet Model',
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 500,
      });
      const anchorA1 = SpatialAnchor.create({
        modelId: cabModel.id,
        code: 'A01',
        name: 'Anchor A01',
      });

      const parentNode = SpatialNode.create({
        locationId: parentLoc.id,
        modelId: cabModel.id,
      });
      const existingChild1Node = SpatialNode.create({
        locationId: child1Loc.id,
        parentSpatialNodeId: parentNode.id,
        anchorId: anchorA1.id,
      });

      nodeRepo.findByLocationId.mockResolvedValue(null);
      nodeRepo.findById.mockResolvedValue(parentNode);
      nodeRepo.findByParentId.mockResolvedValue([existingChild1Node]);
      anchorRepo.findById.mockResolvedValue(anchorA1);

      // Attempting to assign child2 to anchorA1 (already taken by child1)
      await expect(
        service.createNode({
          locationId: child2Loc.id,
          parentSpatialNodeId: parentNode.id,
          anchorId: anchorA1.id,
        }),
      ).rejects.toThrow(SpatialAnchorAlreadyOccupiedError);
    });

    it('prevents deleting a spatial node that has child nodes', async () => {
      const parentNode = SpatialNode.create({ locationId: 'loc-p' });
      const childNode = SpatialNode.create({
        locationId: 'loc-c',
        parentSpatialNodeId: parentNode.id,
      });

      nodeRepo.findById.mockResolvedValue(parentNode);
      nodeRepo.findByParentId.mockResolvedValue([childNode]);

      await expect(service.deleteNode(parentNode.id)).rejects.toThrow(
        SpatialNodeHasChildrenError,
      );
      expect(nodeRepo.delete).not.toHaveBeenCalled();
    });

    it('allows deleting a leaf spatial node without children', async () => {
      const leafNode = SpatialNode.create({ locationId: 'loc-leaf' });

      nodeRepo.findById.mockResolvedValue(leafNode);
      nodeRepo.findByParentId.mockResolvedValue([]);

      await service.deleteNode(leafNode.id);
      expect(nodeRepo.delete).toHaveBeenCalledWith(leafNode.id);
    });
  });

  describe('Hierarchy Integrity & Cycle Prevention', () => {
    it('prevents self-parenting on node update', async () => {
      const node = SpatialNode.create({
        locationId: 'loc-1',
      });
      nodeRepo.findById.mockResolvedValue(node);

      await expect(
        service.updateNode(node.id, {
          parentSpatialNodeId: node.id,
        }),
      ).rejects.toThrow(SpatialNodeCannotParentToSelfError);
    });

    it('detects and rejects circular spatial parentage chains', async () => {
      // Node A -> Node B -> Node C -> trying to set Node C as parent of Node A
      const locA = makeLocation('loc-a', 'LOC-A', 'loc-root');
      const locB = makeLocation('loc-b', 'LOC-B', 'loc-a');
      const locC = makeLocation('loc-c', 'LOC-C', 'loc-b');

      locationRepo.findMany.mockResolvedValue([locA, locB, locC]);

      const nodeA = SpatialNode.create({ locationId: locA.id });
      const nodeB = SpatialNode.create({
        locationId: locB.id,
        parentSpatialNodeId: nodeA.id,
      });
      const nodeC = SpatialNode.create({
        locationId: locC.id,
        parentSpatialNodeId: nodeB.id,
      });

      nodeRepo.findById.mockImplementation((id: string) => {
        if (id === nodeA.id) return Promise.resolve(nodeA);
        if (id === nodeB.id) return Promise.resolve(nodeB);
        if (id === nodeC.id) return Promise.resolve(nodeC);
        return Promise.resolve(null);
      });

      // Updating nodeA to have parent nodeC should trigger cycle error
      await expect(
        service.updateNode(nodeA.id, {
          parentSpatialNodeId: nodeC.id,
        }),
      ).rejects.toThrow(SpatialHierarchyCycleError);
    });

    it('rejects spatial hierarchy that contradicts location hierarchy', async () => {
      // Location Cabinet 1 (CAB-1)
      // Location Cabinet 2 (CAB-2)
      // Location Drawer A (DRW-A, child of CAB-1)
      const cab1 = makeLocation('loc-cab-1', 'CAB-1', null);
      const cab2 = makeLocation('loc-cab-2', 'CAB-2', null);
      const drawerA = makeLocation('loc-drw-a', 'DRW-A', 'loc-cab-1');

      locationRepo.findById.mockImplementation((id: string) => {
        if (id === cab1.id) return Promise.resolve(cab1);
        if (id === cab2.id) return Promise.resolve(cab2);
        if (id === drawerA.id) return Promise.resolve(drawerA);
        return Promise.resolve(null);
      });
      locationRepo.findMany.mockResolvedValue([cab1, cab2, drawerA]);

      const nodeCab2 = SpatialNode.create({ locationId: cab2.id });
      nodeRepo.findById.mockImplementation((id: string) => {
        if (id === nodeCab2.id) return Promise.resolve(nodeCab2);
        return Promise.resolve(null);
      });
      nodeRepo.findByLocationId.mockResolvedValue(null);

      // Attempting to place Drawer A as a spatial child of Cabinet 2
      // must be rejected because Drawer A's authoritative location parent is Cabinet 1
      await expect(
        service.createNode({
          locationId: drawerA.id,
          parentSpatialNodeId: nodeCab2.id,
        }),
      ).rejects.toThrow(SpatialHierarchyLocationMismatchError);
    });
  });

  describe('Composite Location Spatial Context', () => {
    it('returns combined location, node, model, and anchor context without inventory data', async () => {
      const cabLoc = makeLocation('loc-cab-1', 'CAB-1', null);
      const model = SpatialModel.create({
        code: 'CAB-60D',
        name: 'Cabinet 60D',
        widthMm: 310,
        heightMm: 550,
        depthMm: 160,
      });
      const node = SpatialNode.create({
        locationId: cabLoc.id,
        modelId: model.id,
        positionX: 1200,
        positionY: 0,
        positionZ: 800,
      });

      locationRepo.findById.mockResolvedValue(cabLoc);
      nodeRepo.findByLocationId.mockResolvedValue(node);
      modelRepo.findById.mockResolvedValue(model);

      const context = await service.getLocationSpatialContext(cabLoc.id);

      expect(context.location.code).toBe('CAB-1');
      expect(context.node?.positionX).toBe(1200);
      expect(context.model?.code).toBe('CAB-60D');
      expect(context.anchor).toBeNull();

      // Ensure no inventory fields exist
      const contextAny = context as unknown as Record<string, unknown>;
      expect(contextAny['quantity']).toBeUndefined();
      expect(contextAny['transactions']).toBeUndefined();
      expect(contextAny['projections']).toBeUndefined();
    });

    it('reports a root facility as ROOT, never as an unmapped candidate', async () => {
      const rootLoc = makeLocation('loc-root', 'WH-1', null);
      locationRepo.findById.mockResolvedValue(rootLoc);
      nodeRepo.findByLocationId.mockResolvedValue(null);
      locationRepo.findByParentId.mockResolvedValue([]);
      nodeRepo.findMany.mockResolvedValue([]);

      const context = await service.getLocationSpatialContext(rootLoc.id);

      expect(context.mapping.status).toBe('ROOT');
      expect(context.mapping.isMappingEligible).toBe(false);
      expect(context.mapping.containerStatus).toBe('NONE');
      expect(context.mapping.publishedLayout).toBeNull();
    });

    it('exposes a published layout as the container frame without calling the location mapped', async () => {
      const rootLoc = makeLocation('loc-root-2', 'WH-2', null);
      const childLoc = makeLocation('loc-child-1', 'A01', rootLoc.id);
      const publishedLayout = makePublishedLayout(rootLoc.id);

      locationRepo.findById.mockResolvedValue(rootLoc);
      nodeRepo.findByLocationId.mockResolvedValue(null);
      locationRepo.findByParentId.mockResolvedValue([childLoc]);
      nodeRepo.findMany.mockResolvedValue([
        SpatialNode.create({ locationId: childLoc.id }),
      ]);
      layoutRepo.findByParentLocationId.mockResolvedValue([publishedLayout]);

      const context = await service.getLocationSpatialContext(rootLoc.id);

      expect(context.mapping.status).toBe('ROOT');
      expect(context.mapping.containerStatus).toBe('PUBLISHED');
      expect(context.mapping.publishedLayout?.id).toBe(publishedLayout.id);
      expect(context.mapping.publishedLayout?.containerDimensionsMm).toEqual({
        widthMm: 720,
        heightMm: 900,
        depthMm: 300,
      });
      expect(context.mapping.mappedDirectChildCount).toBe(1);
      expect(context.mapping.directChildCount).toBe(1);
    });

    it('distinguishes a stale draft slot mapping from an operational published one', async () => {
      const parentLoc = makeLocation('loc-parent-x', 'CAB-X', null);
      const childLoc = makeLocation('loc-child-x', 'A01', parentLoc.id);

      locationRepo.findById.mockResolvedValue(childLoc);
      nodeRepo.findByLocationId.mockResolvedValue(null);
      locationRepo.findByParentId.mockResolvedValue([]);
      nodeRepo.findMany.mockResolvedValue([]);
      layoutRepo.findMappingsByLocationId.mockResolvedValue([
        {
          id: 'mapping-1',
          layoutId: 'layout-draft-1',
          layoutCode: 'DRAFT-LAYOUT',
          layoutStatus: 'DRAFT',
          slotId: 'drawer_slot_r0_c0',
          slotCode: 'A01',
          locationId: childLoc.id,
          logicalRow: 0,
          logicalCol: 0,
          isStale: true,
          staleReason: 'Slot topology changed',
        },
      ]);

      const context = await service.getLocationSpatialContext(childLoc.id);

      // The location itself is not placed until the draft is published.
      expect(context.mapping.status).toBe('UNMAPPED');
      expect(context.mapping.containerStatus).toBe('NONE');
      expect(context.mapping.slotMapping).toEqual({
        layoutId: 'layout-draft-1',
        layoutCode: 'DRAFT-LAYOUT',
        layoutStatus: 'DRAFT',
        slotCode: 'A01',
        isStale: true,
      });
    });

    it('returns location mapping context with child mapped status and anchor occupancy', async () => {
      const cabLoc = makeLocation('loc-cab', 'CAB-1', null);
      const drw1Loc = makeLocation('loc-drw-1', 'DRW-1', cabLoc.id);
      const drw2Loc = makeLocation('loc-drw-2', 'DRW-2', cabLoc.id);

      locationRepo.findMany.mockResolvedValue([cabLoc, drw1Loc, drw2Loc]);

      const model = SpatialModel.create({
        code: 'CAB-60D',
        name: 'Cabinet 60 Drawers',
        widthMm: 1000,
        heightMm: 1200,
        depthMm: 400,
      });
      const anchorA1 = SpatialAnchor.create({
        modelId: model.id,
        code: 'A01',
        name: 'Drawer A01',
      });
      const anchorA2 = SpatialAnchor.create({
        modelId: model.id,
        code: 'A02',
        name: 'Drawer A02',
      });

      const cabNode = SpatialNode.create({
        locationId: cabLoc.id,
        modelId: model.id,
      });
      const drw1Node = SpatialNode.create({
        locationId: drw1Loc.id,
        parentSpatialNodeId: cabNode.id,
        anchorId: anchorA1.id,
      });

      nodeRepo.findMany.mockResolvedValue([cabNode, drw1Node]);
      modelRepo.findById.mockResolvedValue(model);
      modelRepo.findMany.mockResolvedValue([model]);
      anchorRepo.findByModelId.mockResolvedValue([anchorA1, anchorA2]);

      const mappingContext = await service.getLocationMappingContext(cabLoc.id);

      expect(mappingContext.location.code).toBe('CAB-1');
      expect(mappingContext.node?.id).toBe(cabNode.id);
      expect(mappingContext.model?.code).toBe('CAB-60D');
      expect(mappingContext.modelAnchors).toHaveLength(2);
      expect(mappingContext.children).toHaveLength(2);

      // Child 1 mapped with anchor
      const c1 = mappingContext.children.find(
        (c) => c.location.code === 'DRW-1',
      );
      expect(c1?.isMapped).toBe(true);
      expect(c1?.anchor?.code).toBe('A01');

      // Child 2 unmapped
      const c2 = mappingContext.children.find(
        (c) => c.location.code === 'DRW-2',
      );
      expect(c2?.isMapped).toBe(false);
      expect(c2?.anchor).toBeNull();
    });
  });

  describe('Location Operational View (2D Subtree)', () => {
    it('returns operational view with mapped and unmapped child locations and subtree projections', async () => {
      const parentLoc = makeLocation('loc-parent', 'CAB-A', null);
      const child1 = makeLocation('loc-c1', 'A01', 'loc-parent');
      const child2 = makeLocation('loc-c2', 'A02', 'loc-parent'); // Unmapped child

      const parentModel = SpatialModel.create({
        code: 'CAB-60D',
        name: '60 Drawer Cabinet',
        format: 'BOX',
        widthMm: 600,
        heightMm: 900,
        depthMm: 300,
      });

      const anchor = SpatialAnchor.create({
        modelId: parentModel.id,
        code: 'A01',
        name: 'Drawer A01',
        localPositionX: 50,
        localPositionY: 850,
        localPositionZ: 0,
      });

      const parentNode = SpatialNode.create({
        locationId: parentLoc.id,
        modelId: parentModel.id,
      });

      const child1Node = SpatialNode.create({
        locationId: child1.id,
        parentSpatialNodeId: parentNode.id,
        anchorId: anchor.id,
      });

      locationRepo.findMany.mockResolvedValue([parentLoc, child1, child2]);
      locationRepo.findById.mockResolvedValue(parentLoc);
      nodeRepo.findByLocationId.mockImplementation((locId) => {
        if (locId === parentLoc.id) return Promise.resolve(parentNode);
        if (locId === child1.id) return Promise.resolve(child1Node);
        return Promise.resolve(null);
      });
      nodeRepo.findMany.mockResolvedValue([parentNode, child1Node]);
      modelRepo.findById.mockResolvedValue(parentModel);
      anchorRepo.findByModelId.mockResolvedValue([anchor]);
      anchorRepo.findById.mockResolvedValue(anchor);

      const mockProjections = [
        {
          id: 'proj-1',
          componentId: 'comp-100',
          locationId: 'loc-c1',
          quantity: 2500,
          unitOfMeasure: 'pcs',
          lastUpdated: new Date(),
        },
      ];
      mockProjectionsService.getByLocation.mockResolvedValue(mockProjections);

      const view = await service.getLocationOperationalView(parentLoc.id);

      expect(view.parent.location.code).toBe('CAB-A');
      expect(view.parent.model?.code).toBe('CAB-60D');
      expect(view.parent.anchors).toHaveLength(1);
      // Parent is placed and one of its two children is not.
      expect(view.parent.mapping.status).toBe('PARTIAL');
      expect(view.parent.mapping.mappedDirectChildCount).toBe(1);
      expect(view.parent.mapping.directChildCount).toBe(2);

      // Verify children
      expect(view.children).toHaveLength(2);

      // Child 1 (mapped with anchor)
      const c1 = view.children.find((c) => c.location.code === 'A01');
      expect(c1).toBeDefined();
      expect(c1?.node?.id).toBe(child1Node.id);
      expect(c1?.anchor?.code).toBe('A01');

      // Child 2 (unmapped)
      const c2 = view.children.find((c) => c.location.code === 'A02');
      expect(c2).toBeDefined();
      expect(c2?.node).toBeNull();
      expect(c2?.anchor).toBeNull();

      // Projections preserved with accurate locationId
      expect(view.projections).toHaveLength(1);
      expect(view.projections[0]?.locationId).toBe('loc-c1');
      expect(view.projections[0]?.quantity).toBe(2500);
    });

    it('exposes the authored slot envelope of a layout-mapped child', async () => {
      const parentLoc = makeLocation('loc-parent', 'CAB-A', null);
      const child1 = makeLocation('loc-c1', 'A01', 'loc-parent');

      const childNode = SpatialNode.create({
        locationId: child1.id,
        metadata: {
          source: 'inventory_builder',
          layoutId: 'layout-1',
          slotId: 'drawer_slot_r0_c0',
        },
      });

      locationRepo.findMany.mockResolvedValue([parentLoc, child1]);
      nodeRepo.findByLocationId.mockResolvedValue(null);
      nodeRepo.findMany.mockResolvedValue([childNode]);
      layoutRepo.findByParentLocationId.mockResolvedValue([
        {
          id: 'layout-1',
          parentLocationId: parentLoc.id,
          code: 'LAY-1',
          name: 'Cabinet A layout',
          description: null,
          templateType: 'SMD_DRAWER_CABINET',
          engineVersion: '1',
          config: {
            templateType: 'SMD_DRAWER_CABINET',
            dimensions: { widthMm: 720, heightMm: 900, depthMm: 320 },
            wallThicknessMm: 12,
            dividerThicknessMm: 4,
            rows: 3,
            columns: 4,
          },
          revision: 1,
          status: 'PUBLISHED',
          totalCompartments: 12,
          metadata: {},
          createdBy: null,
          updatedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          mappings: [
            {
              slotId: 'drawer_slot_r0_c0',
              slotCode: 'A01',
              locationId: child1.id,
              logicalRow: 0,
              logicalCol: 0,
            },
          ],
        },
      ]);

      const view = await service.getLocationOperationalView(parentLoc.id);

      const child = view.children.find((c) => c.location.id === child1.id);
      expect(child?.node?.id).toBe(childNode.id);
      expect(child?.slotDimensionsMm).toEqual({
        widthMm: 171,
        heightMm: 289.33,
        depthMm: 308,
      });
    });

    it('throws LocationNotFoundError when location does not exist', async () => {
      locationRepo.findMany.mockResolvedValue([]);
      await expect(
        service.getLocationOperationalView('non-existent'),
      ).rejects.toThrow(LocationNotFoundError);
    });
  });

  describe('Search -> Locate Target Resolution', () => {
    it('resolves component locate target for single stock location inside a spatial container', async () => {
      const warehouse = makeLocation('loc-wh', 'WH-MAIN', null);
      const cabinet = makeLocation('loc-cab-a', 'CAB-A', 'loc-wh');
      const drawer = makeLocation('loc-drawer-a03', 'D-A03', 'loc-cab-a');

      locationRepo.findMany.mockResolvedValue([warehouse, cabinet, drawer]);

      const cabinetNode = SpatialNode.create({
        locationId: cabinet.id,
        modelId: 'model-cab',
      });
      const drawerNode = SpatialNode.create({
        locationId: drawer.id,
        parentSpatialNodeId: cabinetNode.id,
      });
      nodeRepo.findMany.mockResolvedValue([cabinetNode, drawerNode]);

      mockProjectionsService.getByComponent.mockResolvedValue([
        {
          id: 'proj-1',
          componentId: 'comp-100nf',
          locationId: drawer.id,
          quantity: 500,
          unitOfMeasure: 'pcs',
          lastUpdated: new Date(),
        },
      ]);

      const result = await service.resolveComponentLocate('comp-100nf');

      expect(result.componentId).toBe('comp-100nf');
      expect(result.totalOnHand).toBe(500);
      expect(result.targets).toHaveLength(1);

      const target = result.targets[0]!;
      expect(target.locationId).toBe(drawer.id);
      expect(target.locationCode).toBe('D-A03');
      expect(target.spatialRootLocationId).toBe(cabinet.id);
      expect(target.spatialRootLocationCode).toBe('CAB-A');
      expect(target.focusLocationId).toBe(drawer.id);
      expect(target.hasSpatialView).toBe(true);
      expect(target.locateUrl).toBe(
        `/locations/${cabinet.id}?view=spatial&focusLocation=${drawer.id}&focusComponent=comp-100nf`,
      );
      expect(target.path).toBe(
        'Location WH-MAIN / Location CAB-A / Location D-A03',
      );
    });

    it('resolves multiple stock locations for a component', async () => {
      const cabinetA = makeLocation('loc-cab-a', 'CAB-A', null);
      const drawerA = makeLocation('loc-drawer-a', 'D-A1', 'loc-cab-a');
      const cabinetB = makeLocation('loc-cab-b', 'CAB-B', null);
      const drawerB = makeLocation('loc-drawer-b', 'D-B1', 'loc-cab-b');

      locationRepo.findMany.mockResolvedValue([
        cabinetA,
        drawerA,
        cabinetB,
        drawerB,
      ]);

      const nodeCabA = SpatialNode.create({
        locationId: cabinetA.id,
        modelId: 'model-a',
      });
      const nodeCabB = SpatialNode.create({
        locationId: cabinetB.id,
        modelId: 'model-b',
      });
      nodeRepo.findMany.mockResolvedValue([nodeCabA, nodeCabB]);

      mockProjectionsService.getByComponent.mockResolvedValue([
        {
          id: 'proj-1',
          componentId: 'comp-1',
          locationId: drawerA.id,
          quantity: 500,
          unitOfMeasure: 'pcs',
          lastUpdated: new Date(),
        },
        {
          id: 'proj-2',
          componentId: 'comp-1',
          locationId: drawerB.id,
          quantity: 1200,
          unitOfMeasure: 'pcs',
          lastUpdated: new Date(),
        },
      ]);

      const result = await service.resolveComponentLocate('comp-1');

      expect(result.targets).toHaveLength(2);
      expect(result.totalOnHand).toBe(1700);
      expect(result.totalAvailable).toBe(1700);
      expect(result.targets[0]?.spatialRootLocationCode).toBe('CAB-A');
      expect(result.targets[1]?.spatialRootLocationCode).toBe('CAB-B');
    });

    it('returns empty targets when component has no stock', async () => {
      locationRepo.findMany.mockResolvedValue([]);
      nodeRepo.findMany.mockResolvedValue([]);
      mockProjectionsService.getByComponent.mockResolvedValue([
        {
          id: 'proj-0',
          componentId: 'comp-empty',
          locationId: 'loc-1',
          quantity: 0,
          unitOfMeasure: 'pcs',
          lastUpdated: new Date(),
        },
      ]);

      const result = await service.resolveComponentLocate('comp-empty');

      expect(result.targets).toHaveLength(0);
      expect(result.totalOnHand).toBe(0);
    });

    it('resolves deep hierarchy (Cabinet -> Drawer -> Bin) where Cabinet is spatial container', async () => {
      const cabinet = makeLocation('loc-cab', 'CAB-1', null);
      const drawer = makeLocation('loc-drw', 'DRW-1', 'loc-cab');
      const bin = makeLocation('loc-bin', 'BIN-1', 'loc-drw');

      locationRepo.findMany.mockResolvedValue([cabinet, drawer, bin]);

      const cabinetNode = SpatialNode.create({
        locationId: cabinet.id,
        modelId: 'model-cab',
      });
      nodeRepo.findMany.mockResolvedValue([cabinetNode]);

      const target = await service.resolveLocationLocate(bin.id, 'comp-xyz');

      expect(target.spatialRootLocationId).toBe(cabinet.id);
      expect(target.focusLocationId).toBe(drawer.id);
      expect(target.hasSpatialView).toBe(true);
      expect(target.locateUrl).toBe(
        `/locations/${cabinet.id}?view=spatial&focusLocation=${drawer.id}&focusComponent=comp-xyz`,
      );
    });

    it('handles unmapped location without spatial ancestors gracefully', async () => {
      const room = makeLocation('loc-room', 'ROOM-1', null);
      const shelf = makeLocation('loc-shelf', 'SHELF-1', 'loc-room');

      locationRepo.findMany.mockResolvedValue([room, shelf]);
      nodeRepo.findMany.mockResolvedValue([]);

      const target = await service.resolveLocationLocate(shelf.id);

      expect(target.hasSpatialView).toBe(false);
      expect(target.spatialRootLocationId).toBe(shelf.id);
      expect(target.focusLocationId).toBe(shelf.id);
      expect(target.locateUrl).toBe(`/locations/${shelf.id}`);
    });

    it('keeps a requested spatial container as its own root instead of resolving to its parent frame', async () => {
      const warehouse = makeLocation('loc-wh', 'WH-MAIN', null);
      const cabinet = makeLocation('loc-cab', 'CAB-1', 'loc-wh');

      locationRepo.findMany.mockResolvedValue([warehouse, cabinet]);

      const warehouseNode = SpatialNode.create({
        locationId: warehouse.id,
        modelId: 'model-wh',
      });
      const cabinetNode = SpatialNode.create({
        locationId: cabinet.id,
        modelId: 'model-cab',
        parentSpatialNodeId: warehouseNode.id,
      });
      nodeRepo.findMany.mockResolvedValue([warehouseNode, cabinetNode]);

      const target = await service.resolveLocationLocate(cabinet.id);

      expect(target.spatialRootLocationId).toBe(cabinet.id);
      expect(target.focusLocationId).toBe(cabinet.id);
      expect(target.hasSpatialView).toBe(true);
      expect(target.locateUrl).toBe(
        `/locations/${cabinet.id}?view=spatial&focusLocation=${cabinet.id}`,
      );
    });

    it('keeps a requested drawered location with its own model as its own root', async () => {
      const cabinet = makeLocation('loc-cab', 'CAB-1', null);
      const drawer = makeLocation('loc-drw', 'DRW-1', 'loc-cab');

      locationRepo.findMany.mockResolvedValue([cabinet, drawer]);

      const cabinetNode = SpatialNode.create({
        locationId: cabinet.id,
        modelId: 'model-cab',
      });
      const drawerNode = SpatialNode.create({
        locationId: drawer.id,
        modelId: 'model-drawer-deep',
        parentSpatialNodeId: cabinetNode.id,
      });
      nodeRepo.findMany.mockResolvedValue([cabinetNode, drawerNode]);

      const target = await service.resolveLocationLocate(drawer.id);

      expect(target.spatialRootLocationId).toBe(drawer.id);
      expect(target.focusLocationId).toBe(drawer.id);
      expect(target.hasSpatialView).toBe(true);
      expect(target.locateUrl).toBe(
        `/locations/${drawer.id}?view=spatial&focusLocation=${drawer.id}`,
      );
    });

    it('resolves a leaf bin to the drawer frame that directly contains it', async () => {
      const cabinet = makeLocation('loc-cab', 'CAB-1', null);
      const drawer = makeLocation('loc-drw', 'DRW-1', 'loc-cab');
      const bin = makeLocation('loc-bin', 'BIN-1', 'loc-drw');

      locationRepo.findMany.mockResolvedValue([cabinet, drawer, bin]);

      const cabinetNode = SpatialNode.create({
        locationId: cabinet.id,
        modelId: 'model-cab',
      });
      const drawerNode = SpatialNode.create({
        locationId: drawer.id,
        modelId: 'model-drawer-deep',
        parentSpatialNodeId: cabinetNode.id,
      });
      const binNode = SpatialNode.create({
        locationId: bin.id,
        parentSpatialNodeId: drawerNode.id,
      });
      nodeRepo.findMany.mockResolvedValue([cabinetNode, drawerNode, binNode]);

      const target = await service.resolveLocationLocate(bin.id);

      expect(target.locationId).toBe(bin.id);
      expect(target.spatialRootLocationId).toBe(drawer.id);
      expect(target.focusLocationId).toBe(bin.id);
      expect(target.hasSpatialView).toBe(true);
      expect(target.locateUrl).toBe(
        `/locations/${drawer.id}?view=spatial&focusLocation=${bin.id}`,
      );
    });

    it('throws LocationNotFoundError when target location does not exist', async () => {
      locationRepo.findMany.mockResolvedValue([]);
      await expect(
        service.resolveLocationLocate('missing-loc'),
      ).rejects.toThrow(LocationNotFoundError);
    });

    it('returns all spatial nodes via getAllNodes', async () => {
      const node1 = SpatialNode.create({ locationId: 'loc-1' });
      const node2 = SpatialNode.create({ locationId: 'loc-2' });
      nodeRepo.findMany.mockResolvedValue([node1, node2]);

      const result = await service.getAllNodes();
      expect(result).toHaveLength(2);
      expect(result).toEqual([node1, node2]);
      expect(nodeRepo.findMany).toHaveBeenCalled();
    });
  });

  describe('bulkSaveAnchors', () => {
    let testModel: SpatialModel;
    let anchor1: SpatialAnchor;
    let anchor2: SpatialAnchor;

    beforeEach(() => {
      testModel = SpatialModel.create({
        code: 'CAB-MODEL-1',
        name: 'Cabinet Model',
        widthMm: 1000,
        heightMm: 2000,
        depthMm: 500,
      });

      anchor1 = SpatialAnchor.create({
        modelId: testModel.id,
        code: 'A01',
        name: 'Anchor 1',
        localPositionX: 100,
        localPositionY: 200,
        localPositionZ: 0,
      });

      anchor2 = SpatialAnchor.create({
        modelId: testModel.id,
        code: 'A02',
        name: 'Anchor 2',
        localPositionX: 300,
        localPositionY: 200,
        localPositionZ: 0,
      });

      modelRepo.findById.mockResolvedValue(testModel);
      anchorRepo.findByModelId.mockResolvedValue([anchor1, anchor2]);
    });

    it('performs atomic bulk save with creates, updates, and deletes', async () => {
      const createdAnchor = SpatialAnchor.create({
        modelId: testModel.id,
        code: 'A03',
        name: 'Anchor 3',
        localPositionX: 500,
        localPositionY: 200,
        localPositionZ: 0,
      });
      const updatedAnchor = anchor1.update({ name: 'Anchor 1 Renamed' });

      anchorRepo.findByModelId
        .mockResolvedValueOnce([anchor1, anchor2]) // initial load
        .mockResolvedValueOnce([updatedAnchor, createdAnchor]); // after mutations

      const result = await service.bulkSaveAnchors(testModel.id, {
        expectedModelUpdatedAt: testModel.updatedAt.toISOString(),
        creates: [
          {
            code: 'A03',
            name: 'Anchor 3',
            localPositionX: 500,
            localPositionY: 200,
            localPositionZ: 0,
          },
        ],
        updates: [
          {
            id: anchor1.id,
            name: 'Anchor 1 Renamed',
            expectedUpdatedAt: anchor1.updatedAt.toISOString(),
          },
        ],
        deleteIds: [anchor2.id],
      });

      expect(anchorRepo.delete).toHaveBeenCalledWith(anchor2.id);
      expect(anchorRepo.update).toHaveBeenCalled();
      expect(anchorRepo.save).toHaveBeenCalled();
      expect(modelRepo.update).toHaveBeenCalled();
      expect(result.anchors).toHaveLength(2);
      expect(result.modelUpdatedAt).toBeDefined();
    });

    it('throws SpatialModelConflictError when expectedModelUpdatedAt is stale', async () => {
      const staleTimestamp = new Date(
        testModel.updatedAt.getTime() - 60000,
      ).toISOString();

      await expect(
        service.bulkSaveAnchors(testModel.id, {
          expectedModelUpdatedAt: staleTimestamp,
          creates: [],
        }),
      ).rejects.toThrow(SpatialModelConflictError);

      expect(anchorRepo.delete).not.toHaveBeenCalled();
      expect(anchorRepo.update).not.toHaveBeenCalled();
      expect(anchorRepo.save).not.toHaveBeenCalled();
    });

    it('throws SpatialAnchorConflictError when an anchor expectedUpdatedAt is stale', async () => {
      const staleTimestamp = new Date(
        anchor1.updatedAt.getTime() - 60000,
      ).toISOString();

      await expect(
        service.bulkSaveAnchors(testModel.id, {
          updates: [
            {
              id: anchor1.id,
              name: 'Updated Name',
              expectedUpdatedAt: staleTimestamp,
            },
          ],
        }),
      ).rejects.toThrow(SpatialAnchorConflictError);

      expect(anchorRepo.update).not.toHaveBeenCalled();
    });

    it('rejects duplicate anchor codes within creates and updates', async () => {
      await expect(
        service.bulkSaveAnchors(testModel.id, {
          creates: [
            { code: 'A01', name: 'Duplicate A01' }, // A01 already exists on model!
          ],
        }),
      ).rejects.toThrow(InvalidSpatialAnchorCodeError);

      await expect(
        service.bulkSaveAnchors(testModel.id, {
          creates: [
            { code: 'NEW-01', name: 'First' },
            { code: 'NEW-01', name: 'Second' },
          ],
        }),
      ).rejects.toThrow(InvalidSpatialAnchorCodeError);
    });

    it('safely unassigns referencing child spatial nodes when an anchor is deleted', async () => {
      const referencingNode = SpatialNode.create({
        locationId: 'loc-child-drawer',
        parentSpatialNodeId: 'loc-parent-cabinet',
        anchorId: anchor2.id,
      });

      nodeRepo.findByAnchorId.mockResolvedValue([referencingNode]);

      await service.bulkSaveAnchors(testModel.id, {
        deleteIds: [anchor2.id],
      });

      // Verify child node was unassigned (anchorId set to null)
      expect(nodeRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: referencingNode.id,
          anchorId: null,
          locationId: 'loc-child-drawer',
          parentSpatialNodeId: 'loc-parent-cabinet',
        }),
      );
      expect(anchorRepo.delete).toHaveBeenCalledWith(anchor2.id);
    });

    it('rejects modifying an anchor that belongs to a different model', async () => {
      const otherModelAnchor = SpatialAnchor.create({
        modelId: 'other-model-id',
        code: 'OTHER-01',
        name: 'Other Model Anchor',
      });
      anchorRepo.findById.mockResolvedValue(otherModelAnchor);

      await expect(
        service.bulkSaveAnchors(testModel.id, {
          updates: [
            {
              id: otherModelAnchor.id,
              name: 'Hijacked',
            },
          ],
        }),
      ).rejects.toThrow(SpatialAnchorDoesNotBelongToModelError);
    });

    it('rejects updating and deleting the same anchor in the same batch', async () => {
      await expect(
        service.bulkSaveAnchors(testModel.id, {
          updates: [{ id: anchor1.id, name: 'Renamed' }],
          deleteIds: [anchor1.id],
        }),
      ).rejects.toThrow(/cannot be both updated and deleted/);
    });
  });
});
