import { Inject, Injectable } from '@nestjs/common';
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
  SpatialAnchorNotFoundError,
  SpatialNodeNotFoundError,
  SpatialModelInUseError,
  SpatialAnchorDoesNotBelongToModelError,
  SpatialNodeCannotParentToSelfError,
  SpatialHierarchyCycleError,
  SpatialHierarchyLocationMismatchError,
  LocationNotFoundError,
  SpatialAnchorAlreadyOccupiedError,
  SpatialNodeHasChildrenError,
  type InventoryProjection,
} from '@ananya/inventory';
import {
  SPATIAL_MODEL_REPOSITORY,
  SPATIAL_ANCHOR_REPOSITORY,
  SPATIAL_NODE_REPOSITORY,
} from './spatial.tokens';
import { LOCATION_REPOSITORY } from '../locations/location.tokens';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';
import type {
  CreateSpatialModelDto,
  UpdateSpatialModelDto,
  CreateSpatialAnchorDto,
  UpdateSpatialAnchorDto,
  CreateSpatialNodeDto,
  UpdateSpatialNodeDto,
} from './dtos';

export interface LocationSpatialContext {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
  };
  node: SpatialNode | null;
  model: SpatialModel | null;
  anchor: SpatialAnchor | null;
  parentSpatialNode: SpatialNode | null;
}

export interface LocationOperationalViewChild {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
    isActive: boolean;
  };
  node: SpatialNode | null;
  model: SpatialModel | null;
  anchor: SpatialAnchor | null;
}

export interface LocationOperationalView {
  parent: {
    location: {
      id: string;
      code: string;
      name: string;
      kind: string;
      parentId: string | null;
      isActive: boolean;
    };
    node: SpatialNode | null;
    model: SpatialModel | null;
    anchors: SpatialAnchor[];
  };
  children: LocationOperationalViewChild[];
  descendantLocations: Array<{
    id: string;
    code: string;
    name: string;
    parentId: string | null;
  }>;
  projections: InventoryProjection[];
}

export interface LocationLocateTarget {
  locationId: string;
  locationCode: string;
  locationName: string;
  path: string;
  spatialRootLocationId: string;
  spatialRootLocationCode: string;
  focusLocationId: string;
  focusLocationCode: string;
  hasSpatialView: boolean;
  locateUrl: string;
}

export interface ComponentLocateTarget extends LocationLocateTarget {
  componentId: string;
  onHand: number;
  available: number;
}

export interface ComponentLocateResolution {
  componentId: string;
  targets: ComponentLocateTarget[];
  totalOnHand: number;
  totalAvailable: number;
}

export interface LocationMappingChildItem {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
    isActive: boolean;
  };
  node: SpatialNode | null;
  anchor: SpatialAnchor | null;
  isMapped: boolean;
}

export interface LocationMappingContext {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
    isActive: boolean;
  };
  node: SpatialNode | null;
  model: SpatialModel | null;
  anchor: SpatialAnchor | null;
  parentLocation: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
  } | null;
  parentSpatialNode: SpatialNode | null;
  parentModel: SpatialModel | null;
  parentAnchors: SpatialAnchor[];
  parentAnchorOccupancy: Array<{
    anchorId: string;
    anchorCode: string;
    occupiedByLocationId: string;
    occupiedByLocationCode: string;
  }>;
  modelAnchors: SpatialAnchor[];
  children: LocationMappingChildItem[];
  availableModels: SpatialModel[];
}

@Injectable()
export class SpatialService {
  constructor(
    @Inject(SPATIAL_MODEL_REPOSITORY)
    private readonly modelRepo: SpatialModelRepository,
    @Inject(SPATIAL_ANCHOR_REPOSITORY)
    private readonly anchorRepo: SpatialAnchorRepository,
    @Inject(SPATIAL_NODE_REPOSITORY)
    private readonly nodeRepo: SpatialNodeRepository,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepo: LocationRepository,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  // ==========================================
  // Spatial Models
  // ==========================================

  async createModel(dto: CreateSpatialModelDto): Promise<SpatialModel> {
    const model = SpatialModel.create(dto);
    return this.modelRepo.save(model);
  }

  async getModel(id: string): Promise<SpatialModel> {
    const model = await this.modelRepo.findById(id);
    if (!model) {
      throw new SpatialModelNotFoundError(id);
    }
    return model;
  }

  async getAllModels(options?: {
    isActive?: boolean;
  }): Promise<SpatialModel[]> {
    return this.modelRepo.findMany(options);
  }

  async updateModel(
    id: string,
    dto: UpdateSpatialModelDto,
  ): Promise<SpatialModel> {
    const existing = await this.getModel(id);
    const updated = existing.update(dto);
    return this.modelRepo.update(updated);
  }

  async deleteModel(id: string): Promise<void> {
    await this.getModel(id);
    const inUse = await this.modelRepo.isInUse(id);
    if (inUse) {
      throw new SpatialModelInUseError(id);
    }
    await this.modelRepo.delete(id);
  }

  // ==========================================
  // Spatial Anchors
  // ==========================================

  async createAnchor(
    modelId: string,
    dto: CreateSpatialAnchorDto,
  ): Promise<SpatialAnchor> {
    await this.getModel(modelId);

    const anchor = SpatialAnchor.create({
      ...dto,
      modelId,
    });
    return this.anchorRepo.save(anchor);
  }

  async getAnchor(id: string): Promise<SpatialAnchor> {
    const anchor = await this.anchorRepo.findById(id);
    if (!anchor) {
      throw new SpatialAnchorNotFoundError(id);
    }
    return anchor;
  }

  async getAnchorsByModel(modelId: string): Promise<SpatialAnchor[]> {
    await this.getModel(modelId);
    return this.anchorRepo.findByModelId(modelId);
  }

  async updateAnchor(
    id: string,
    dto: UpdateSpatialAnchorDto,
  ): Promise<SpatialAnchor> {
    const existing = await this.getAnchor(id);
    const updated = existing.update(dto);
    return this.anchorRepo.update(updated);
  }

  async deleteAnchor(id: string): Promise<void> {
    await this.getAnchor(id);
    await this.anchorRepo.delete(id);
  }

  // ==========================================
  // Spatial Nodes
  // ==========================================

  async createNode(dto: CreateSpatialNodeDto): Promise<SpatialNode> {
    // 1. Validate Location existence
    const location = await this.locationRepo.findById(dto.locationId);
    if (!location) {
      throw new LocationNotFoundError(dto.locationId);
    }

    // 2. Validate uniqueness of spatial node per location
    const existingNode = await this.nodeRepo.findByLocationId(dto.locationId);
    if (existingNode) {
      throw new Error(
        `Location '${location.code}' already has a spatial representation: ${existingNode.id}`,
      );
    }

    // 3. Validate model existence if provided
    if (dto.modelId) {
      await this.getModel(dto.modelId);
    }

    // 4. Validate parent hierarchy and location hierarchy consistency
    let parentNode: SpatialNode | null = null;
    if (dto.parentSpatialNodeId) {
      parentNode = await this.nodeRepo.findById(dto.parentSpatialNodeId);
      if (!parentNode) {
        throw new SpatialNodeNotFoundError(dto.parentSpatialNodeId);
      }

      await this.validateLocationHierarchyConsistency(
        dto.locationId,
        parentNode.locationId,
      );
    }

    // 5. Validate anchor consistency & occupancy if provided
    if (dto.anchorId) {
      const anchor = await this.getAnchor(dto.anchorId);
      const allowedModelId = parentNode?.modelId || dto.modelId;
      if (!allowedModelId || anchor.modelId !== allowedModelId) {
        throw new SpatialAnchorDoesNotBelongToModelError(
          dto.anchorId,
          allowedModelId || 'NONE',
        );
      }

      // Check if anchor is already occupied by a sibling node under the same parent
      if (dto.parentSpatialNodeId) {
        const siblings = await this.nodeRepo.findByParentId(
          dto.parentSpatialNodeId,
        );
        const occupiedSibling = siblings.find(
          (s) => s.anchorId === dto.anchorId,
        );
        if (occupiedSibling) {
          const siblingLoc = await this.locationRepo.findById(
            occupiedSibling.locationId,
          );
          throw new SpatialAnchorAlreadyOccupiedError(
            anchor.code,
            siblingLoc?.code ?? occupiedSibling.locationId,
          );
        }
      }
    }

    const node = SpatialNode.create(dto);
    return this.nodeRepo.save(node);
  }

  async getNode(id: string): Promise<SpatialNode> {
    const node = await this.nodeRepo.findById(id);
    if (!node) {
      throw new SpatialNodeNotFoundError(id);
    }
    return node;
  }

  async getAllNodes(): Promise<SpatialNode[]> {
    return this.nodeRepo.findMany();
  }

  async getNodeByLocation(locationId: string): Promise<SpatialNode | null> {
    return this.nodeRepo.findByLocationId(locationId);
  }

  async updateNode(
    id: string,
    dto: UpdateSpatialNodeDto,
  ): Promise<SpatialNode> {
    const existing = await this.getNode(id);

    // 1. Prevent self-parenting
    if (
      dto.parentSpatialNodeId !== undefined &&
      dto.parentSpatialNodeId === id
    ) {
      throw new SpatialNodeCannotParentToSelfError(id);
    }

    // 2. Determine effective model, parent, and anchor
    const effectiveModelId =
      dto.modelId !== undefined ? dto.modelId : existing.modelId;
    const effectiveParentNodeId =
      dto.parentSpatialNodeId !== undefined
        ? dto.parentSpatialNodeId
        : existing.parentSpatialNodeId;
    const effectiveAnchorId =
      dto.anchorId !== undefined ? dto.anchorId : existing.anchorId;

    if (effectiveModelId) {
      await this.getModel(effectiveModelId);
    }

    let parentNode: SpatialNode | null = null;
    if (effectiveParentNodeId) {
      parentNode = await this.nodeRepo.findById(effectiveParentNodeId);
      if (!parentNode) {
        throw new SpatialNodeNotFoundError(effectiveParentNodeId);
      }

      if (effectiveParentNodeId !== existing.parentSpatialNodeId) {
        await this.validateNoSpatialCycle(id, effectiveParentNodeId);
      }
      await this.validateLocationHierarchyConsistency(
        existing.locationId,
        parentNode.locationId,
      );
    }

    if (effectiveAnchorId) {
      const anchor = await this.getAnchor(effectiveAnchorId);
      const allowedModelId = parentNode?.modelId || effectiveModelId;
      if (!allowedModelId || anchor.modelId !== allowedModelId) {
        throw new SpatialAnchorDoesNotBelongToModelError(
          effectiveAnchorId,
          allowedModelId || 'NONE',
        );
      }

      if (effectiveParentNodeId) {
        const siblings = await this.nodeRepo.findByParentId(
          effectiveParentNodeId,
        );
        const occupiedSibling = siblings.find(
          (s) => s.anchorId === effectiveAnchorId && s.id !== id,
        );
        if (occupiedSibling) {
          const siblingLoc = await this.locationRepo.findById(
            occupiedSibling.locationId,
          );
          throw new SpatialAnchorAlreadyOccupiedError(
            anchor.code,
            siblingLoc?.code ?? occupiedSibling.locationId,
          );
        }
      }
    }

    const updated = existing.update(dto);
    return this.nodeRepo.update(updated);
  }

  async deleteNode(id: string): Promise<void> {
    await this.getNode(id);
    const children = await this.nodeRepo.findByParentId(id);
    if (children.length > 0) {
      throw new SpatialNodeHasChildrenError(id, children.length);
    }
    await this.nodeRepo.delete(id);
  }

  async getLocationMappingContext(
    locationId: string,
  ): Promise<LocationMappingContext> {
    const allLocations = await this.locationRepo.findMany();
    const location = allLocations.find((l) => l.id === locationId);
    if (!location) {
      throw new LocationNotFoundError(locationId);
    }

    const allNodes = await this.nodeRepo.findMany();
    const nodesByLocId = new Map(allNodes.map((n) => [n.locationId, n]));

    const node = nodesByLocId.get(locationId) || null;
    let model: SpatialModel | null = null;
    let anchor: SpatialAnchor | null = null;
    let modelAnchors: SpatialAnchor[] = [];

    if (node?.modelId) {
      model = await this.modelRepo.findById(node.modelId);
      if (model) {
        modelAnchors = await this.anchorRepo.findByModelId(model.id);
      }
    }
    if (node?.anchorId) {
      anchor = await this.anchorRepo.findById(node.anchorId);
    }

    let parentLocation: Location | null = null;
    let parentSpatialNode: SpatialNode | null = null;
    let parentModel: SpatialModel | null = null;
    let parentAnchors: SpatialAnchor[] = [];
    const parentAnchorOccupancy: LocationMappingContext['parentAnchorOccupancy'] =
      [];

    if (location.parentId) {
      parentLocation =
        allLocations.find((l) => l.id === location.parentId) || null;
      if (parentLocation) {
        parentSpatialNode = nodesByLocId.get(parentLocation.id) || null;
        if (parentSpatialNode?.modelId) {
          parentModel = await this.modelRepo.findById(
            parentSpatialNode.modelId,
          );
          if (parentModel) {
            parentAnchors = await this.anchorRepo.findByModelId(parentModel.id);
          }
        }
        if (parentSpatialNode) {
          const siblings = allNodes.filter(
            (n) => n.parentSpatialNodeId === parentSpatialNode!.id,
          );
          const locationMap = new Map(allLocations.map((l) => [l.id, l]));
          for (const sib of siblings) {
            if (sib.anchorId) {
              const sibAnchor = parentAnchors.find(
                (a) => a.id === sib.anchorId,
              );
              const sibLoc = locationMap.get(sib.locationId);
              if (sibAnchor && sibLoc) {
                parentAnchorOccupancy.push({
                  anchorId: sibAnchor.id,
                  anchorCode: sibAnchor.code,
                  occupiedByLocationId: sibLoc.id,
                  occupiedByLocationCode: sibLoc.code,
                });
              }
            }
          }
        }
      }
    }

    const directChildLocations = allLocations.filter(
      (l) => l.parentId === locationId,
    );
    const anchorCache = new Map(modelAnchors.map((a) => [a.id, a]));

    const children: LocationMappingChildItem[] = [];
    for (const childLoc of directChildLocations) {
      const childNode = nodesByLocId.get(childLoc.id) || null;
      let childAnchor: SpatialAnchor | null = null;
      if (childNode?.anchorId) {
        childAnchor =
          anchorCache.get(childNode.anchorId) ||
          (await this.anchorRepo.findById(childNode.anchorId));
      }
      children.push({
        location: {
          id: childLoc.id,
          code: childLoc.code,
          name: childLoc.name,
          kind: childLoc.kind,
          parentId: childLoc.parentId,
          isActive: childLoc.isActive,
        },
        node: childNode,
        anchor: childAnchor,
        isMapped: childNode !== null,
      });
    }

    const availableModels = await this.modelRepo.findMany({ isActive: true });

    return {
      location: {
        id: location.id,
        code: location.code,
        name: location.name,
        kind: location.kind,
        parentId: location.parentId,
        isActive: location.isActive,
      },
      node,
      model,
      anchor,
      parentLocation: parentLocation
        ? {
            id: parentLocation.id,
            code: parentLocation.code,
            name: parentLocation.name,
            kind: parentLocation.kind,
            parentId: parentLocation.parentId,
          }
        : null,
      parentSpatialNode,
      parentModel,
      parentAnchors,
      parentAnchorOccupancy,
      modelAnchors,
      children,
      availableModels,
    };
  }

  // ==========================================
  // Composite Location Spatial Context
  // ==========================================

  async getLocationSpatialContext(
    locationId: string,
  ): Promise<LocationSpatialContext> {
    const location = await this.locationRepo.findById(locationId);
    if (!location) {
      throw new LocationNotFoundError(locationId);
    }

    const node = await this.nodeRepo.findByLocationId(locationId);

    let model: SpatialModel | null = null;
    let anchor: SpatialAnchor | null = null;
    let parentSpatialNode: SpatialNode | null = null;

    if (node) {
      if (node.modelId) {
        model = await this.modelRepo.findById(node.modelId);
      }
      if (node.anchorId) {
        anchor = await this.anchorRepo.findById(node.anchorId);
      }
      if (node.parentSpatialNodeId) {
        parentSpatialNode = await this.nodeRepo.findById(
          node.parentSpatialNodeId,
        );
      }
    }

    return {
      location: {
        id: location.id,
        code: location.code,
        name: location.name,
        kind: location.kind,
        parentId: location.parentId,
      },
      node,
      model,
      anchor,
      parentSpatialNode,
    };
  }

  async getLocationOperationalView(
    locationId: string,
  ): Promise<LocationOperationalView> {
    const allLocations = await this.locationRepo.findMany();
    const location = allLocations.find((l) => l.id === locationId);
    if (!location) {
      throw new LocationNotFoundError(locationId);
    }

    // Build map of children by parentId for fast hierarchy resolution
    const childrenByParent = new Map<string, typeof allLocations>();
    for (const loc of allLocations) {
      if (loc.parentId) {
        const siblings = childrenByParent.get(loc.parentId) || [];
        siblings.push(loc);
        childrenByParent.set(loc.parentId, siblings);
      }
    }

    const directChildren = childrenByParent.get(locationId) || [];

    // BFS to collect all subtree location records (for relative path resolution)
    const subtreeLocations: typeof allLocations = [location];
    const queue: string[] = [locationId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const children = childrenByParent.get(current);
      if (children) {
        for (const child of children) {
          subtreeLocations.push(child);
          queue.push(child.id);
        }
      }
    }

    // Resolve parent spatial node, model, and anchors
    const parentNode = await this.nodeRepo.findByLocationId(locationId);
    let parentModel: SpatialModel | null = null;
    let parentAnchors: SpatialAnchor[] = [];

    if (parentNode?.modelId) {
      parentModel = await this.modelRepo.findById(parentNode.modelId);
      if (parentModel) {
        parentAnchors = await this.anchorRepo.findByModelId(parentModel.id);
      }
    }

    // Resolve spatial nodes for direct children
    const allNodes = await this.nodeRepo.findMany();
    const nodesByLocId = new Map(allNodes.map((n) => [n.locationId, n]));

    const modelCache = new Map<string, SpatialModel | null>();
    const anchorCache = new Map<string, SpatialAnchor | null>();
    for (const anchor of parentAnchors) {
      anchorCache.set(anchor.id, anchor);
    }

    const children: LocationOperationalViewChild[] = [];
    for (const childLoc of directChildren) {
      const childNode = nodesByLocId.get(childLoc.id) || null;
      let childModel: SpatialModel | null = null;
      let childAnchor: SpatialAnchor | null = null;

      if (childNode?.modelId) {
        if (modelCache.has(childNode.modelId)) {
          childModel = modelCache.get(childNode.modelId)!;
        } else {
          childModel = await this.modelRepo.findById(childNode.modelId);
          modelCache.set(childNode.modelId, childModel);
        }
      }

      if (childNode?.anchorId) {
        if (anchorCache.has(childNode.anchorId)) {
          childAnchor = anchorCache.get(childNode.anchorId)!;
        } else {
          childAnchor = await this.anchorRepo.findById(childNode.anchorId);
          anchorCache.set(childNode.anchorId, childAnchor);
        }
      }

      children.push({
        location: {
          id: childLoc.id,
          code: childLoc.code,
          name: childLoc.name,
          kind: childLoc.kind,
          parentId: childLoc.parentId,
          isActive: childLoc.isActive,
        },
        node: childNode,
        model: childModel,
        anchor: childAnchor,
      });
    }

    // Resolve subtree projections via existing inventory projections service
    const projections =
      await this.inventoryProjectionsService.getByLocation(locationId);

    return {
      parent: {
        location: {
          id: location.id,
          code: location.code,
          name: location.name,
          kind: location.kind,
          parentId: location.parentId,
          isActive: location.isActive,
        },
        node: parentNode,
        model: parentModel,
        anchors: parentAnchors,
      },
      children,
      descendantLocations: subtreeLocations.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        parentId: l.parentId,
      })),
      projections,
    };
  }

  // ==========================================
  // Search -> Locate Target Resolution
  // ==========================================

  async resolveLocationLocate(
    locationId: string,
    componentId?: string,
  ): Promise<LocationLocateTarget> {
    return this.resolveLocationLocateTarget(locationId, componentId);
  }

  async resolveComponentLocate(
    componentId: string,
  ): Promise<ComponentLocateResolution> {
    const projections =
      await this.inventoryProjectionsService.getByComponent(componentId);

    const stockProjections = projections.filter(
      (p) => Number(p.quantity || 0) > 0,
    );

    const allLocations = await this.locationRepo.findMany();
    const allNodes = await this.nodeRepo.findMany();

    const targets: ComponentLocateTarget[] = [];
    let totalOnHand = 0;
    let totalAvailable = 0;

    for (const proj of stockProjections) {
      const onHand = Number(proj.quantity || 0);
      const available = onHand;
      totalOnHand += onHand;
      totalAvailable += available;

      const locTarget = await this.resolveLocationLocateTarget(
        proj.locationId,
        componentId,
        allLocations,
        allNodes,
      );

      targets.push({
        ...locTarget,
        componentId,
        onHand,
        available,
      });
    }

    return {
      componentId,
      targets,
      totalOnHand,
      totalAvailable,
    };
  }

  private async resolveLocationLocateTarget(
    locationId: string,
    componentId?: string,
    allLocations?: Location[],
    allNodes?: SpatialNode[],
  ): Promise<LocationLocateTarget> {
    const locations = allLocations ?? (await this.locationRepo.findMany());
    const nodes = allNodes ?? (await this.nodeRepo.findMany());

    const locationMap = new Map(locations.map((l) => [l.id, l]));
    const targetLoc = locationMap.get(locationId);
    if (!targetLoc) {
      throw new LocationNotFoundError(locationId);
    }

    const nodesByLocId = new Map(nodes.map((n) => [n.locationId, n]));

    const childrenByParent = new Map<string, Location[]>();
    for (const loc of locations) {
      if (loc.parentId) {
        const siblings = childrenByParent.get(loc.parentId) || [];
        siblings.push(loc);
        childrenByParent.set(loc.parentId, siblings);
      }
    }

    const isSpatialContainer = (locId: string): boolean => {
      const node = nodesByLocId.get(locId);
      if (node?.modelId) return true;
      const children = childrenByParent.get(locId) || [];
      return children.some((c) => nodesByLocId.has(c.id));
    };

    const chain: Location[] = [targetLoc];
    let currentParentId = targetLoc.parentId;
    const visited = new Set<string>([targetLoc.id]);
    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      const parent = locationMap.get(currentParentId);
      if (!parent) break;
      chain.push(parent);
      currentParentId = parent.parentId;
    }

    const path = chain
      .slice()
      .reverse()
      .map((l) => l.name)
      .join(' / ');

    let spatialRoot = targetLoc;
    let focusLocation = targetLoc;
    let hasSpatialView = false;

    for (let i = 1; i < chain.length; i++) {
      const ancestor = chain[i];
      const childInChain = chain[i - 1];
      if (ancestor && childInChain && isSpatialContainer(ancestor.id)) {
        spatialRoot = ancestor;
        focusLocation = childInChain;
        hasSpatialView = true;
        break;
      }
    }

    if (!hasSpatialView && isSpatialContainer(targetLoc.id)) {
      spatialRoot = targetLoc;
      focusLocation = targetLoc;
      hasSpatialView = true;
    }

    const queryParams = new URLSearchParams();
    if (hasSpatialView) {
      queryParams.set('view', 'spatial');
      queryParams.set('focusLocation', focusLocation.id);
      if (componentId) {
        queryParams.set('focusComponent', componentId);
      }
    }

    const queryString = queryParams.toString();
    const locateUrl = hasSpatialView
      ? `/locations/${spatialRoot.id}?${queryString}`
      : `/locations/${targetLoc.id}`;

    return {
      locationId: targetLoc.id,
      locationCode: targetLoc.code,
      locationName: targetLoc.name,
      path,
      spatialRootLocationId: spatialRoot.id,
      spatialRootLocationCode: spatialRoot.code,
      focusLocationId: focusLocation.id,
      focusLocationCode: focusLocation.code,
      hasSpatialView,
      locateUrl,
    };
  }

  // ==========================================
  // Helper Validations
  // ==========================================

  private async validateNoSpatialCycle(
    nodeId: string,
    proposedParentId: string,
  ): Promise<void> {
    const visited = new Set<string>([nodeId]);
    let currentId: string | null = proposedParentId;

    while (currentId) {
      if (visited.has(currentId)) {
        throw new SpatialHierarchyCycleError(nodeId, proposedParentId);
      }
      visited.add(currentId);
      const parent = await this.nodeRepo.findById(currentId);
      currentId = parent?.parentSpatialNodeId ?? null;
    }
  }

  private async validateLocationHierarchyConsistency(
    childLocationId: string,
    parentLocationId: string,
  ): Promise<void> {
    if (childLocationId === parentLocationId) {
      const loc = await this.locationRepo.findById(childLocationId);
      throw new SpatialHierarchyLocationMismatchError(
        loc?.code ?? childLocationId,
        loc?.code ?? parentLocationId,
      );
    }

    const allLocations = await this.locationRepo.findMany();
    const locationMap = new Map(allLocations.map((l) => [l.id, l]));

    const childLoc = locationMap.get(childLocationId);
    const parentLoc = locationMap.get(parentLocationId);

    if (!childLoc || !parentLoc) {
      throw new SpatialHierarchyLocationMismatchError(
        childLoc?.code ?? childLocationId,
        parentLoc?.code ?? parentLocationId,
      );
    }

    // Traverse childLoc's parentId ancestry
    let currentParentId: string | null = childLoc.parentId;
    let found = false;
    const visited = new Set<string>();

    while (currentParentId && !visited.has(currentParentId)) {
      visited.add(currentParentId);
      if (currentParentId === parentLocationId) {
        found = true;
        break;
      }
      const cur = locationMap.get(currentParentId);
      currentParentId = cur?.parentId ?? null;
    }

    if (!found) {
      throw new SpatialHierarchyLocationMismatchError(
        childLoc.code,
        parentLoc.code,
      );
    }
  }
}
