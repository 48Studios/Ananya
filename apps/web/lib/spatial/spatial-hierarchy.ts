import type { LocationDto } from "../api/locations-api";
import type { SpatialNodeDto } from "../api/spatial-api";

export type SpatialMappingStatus = "MAPPED" | "PARTIAL" | "UNMAPPED";

export interface LocationTreeNode {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  isActive: boolean;
  hasSpatialNode: boolean;
  spatialNodeId?: string;
  status: SpatialMappingStatus;
  mappedChildrenCount: number;
  totalChildrenCount: number;
  children: LocationTreeNode[];
}

export interface HierarchyStats {
  totalLocations: number;
  mappedCount: number;
  unmappedCount: number;
  partialCount: number;
}

/**
 * Builds an authoritative hierarchical tree from a flat list of locations and spatial nodes.
 * Accurately determines whether each node is Mapped (has SpatialNode),
 * Partial (has SpatialNode, but some children unmapped), or Unmapped (no SpatialNode).
 */
export function buildLocationTree(
  locations: LocationDto[],
  nodes: SpatialNodeDto[],
): LocationTreeNode[] {
  const nodeMap = new Map<string, SpatialNodeDto>();
  for (const node of nodes) {
    nodeMap.set(node.locationId, node);
  }

  // Group children by parentId
  const childrenMap = new Map<string | null, LocationDto[]>();
  for (const loc of locations) {
    const pId = loc.parentId ?? null;
    const existing = childrenMap.get(pId) || [];
    existing.push(loc);
    childrenMap.set(pId, existing);
  }

  // Sort children alphabetically by code
  for (const list of childrenMap.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  function createSubTree(parentId: string | null): LocationTreeNode[] {
    const directChildren = childrenMap.get(parentId) || [];

    return directChildren.map((loc) => {
      const spatialNode = nodeMap.get(loc.id);
      const hasSpatialNode = Boolean(spatialNode);
      const childTreeNodes = createSubTree(loc.id);

      const totalChildrenCount = childTreeNodes.length;
      const mappedChildrenCount = childTreeNodes.filter(
        (c) => c.hasSpatialNode,
      ).length;

      let status: SpatialMappingStatus;
      if (!hasSpatialNode) {
        // Even if an ancestor has a spatial node, the location itself is unmapped
        status = "UNMAPPED";
      } else if (
        totalChildrenCount > 0 &&
        mappedChildrenCount < totalChildrenCount
      ) {
        status = "PARTIAL";
      } else {
        status = "MAPPED";
      }

      return {
        id: loc.id,
        code: loc.code,
        name: loc.name,
        kind: loc.kind,
        parentId: loc.parentId,
        isActive: loc.isActive,
        hasSpatialNode,
        spatialNodeId: spatialNode?.id,
        status,
        mappedChildrenCount,
        totalChildrenCount,
        children: childTreeNodes,
      };
    });
  }

  return createSubTree(null);
}

/**
 * Traverses the location list to find all ancestor location IDs for a given target ID.
 */
export function getAncestorIds(
  locations: LocationDto[],
  targetId: string,
): string[] {
  const locMap = new Map<string, LocationDto>();
  for (const loc of locations) {
    locMap.set(loc.id, loc);
  }

  const ancestors: string[] = [];
  const visited = new Set<string>();
  let current = locMap.get(targetId);

  while (current && current.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    ancestors.push(current.parentId);
    current = locMap.get(current.parentId);
  }

  return ancestors;
}

/**
 * Searches and filters the tree by query (matching code or name).
 * If a child matches, its ancestors are retained so the hierarchy is preserved.
 */
export function filterLocationTree(
  tree: LocationTreeNode[],
  query: string,
): LocationTreeNode[] {
  const term = query.trim().toLowerCase();
  if (!term) return tree;

  function filterNodes(nodes: LocationTreeNode[]): LocationTreeNode[] {
    const result: LocationTreeNode[] = [];

    for (const node of nodes) {
      const matchesSelf =
        node.code.toLowerCase().includes(term) ||
        node.name.toLowerCase().includes(term) ||
        node.kind.toLowerCase().includes(term);

      const filteredChildren = filterNodes(node.children);

      if (matchesSelf || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        });
      }
    }

    return result;
  }

  return filterNodes(tree);
}

/**
 * Finds a specific node anywhere in the tree.
 */
export function findNodeInTree(
  nodes: LocationTreeNode[],
  targetId: string,
): LocationTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const found = findNodeInTree(node.children, targetId);
    if (found) return found;
  }
  return null;
}

/**
 * Aggregates statistics across the tree.
 */
export function calculateHierarchyStats(
  locations: LocationDto[],
  nodes: SpatialNodeDto[],
): HierarchyStats {
  const nodeLocationIds = new Set(nodes.map((n) => n.locationId));
  const mappedCount = locations.filter((l) => nodeLocationIds.has(l.id)).length;
  const unmappedCount = locations.length - mappedCount;

  // Partial: location has spatial node, has children, and at least 1 child is unmapped
  const childrenMap = new Map<string, string[]>();
  for (const l of locations) {
    if (l.parentId) {
      const list = childrenMap.get(l.parentId) || [];
      list.push(l.id);
      childrenMap.set(l.parentId, list);
    }
  }

  let partialCount = 0;
  for (const l of locations) {
    if (nodeLocationIds.has(l.id)) {
      const childIds = childrenMap.get(l.id) || [];
      if (childIds.length > 0) {
        const unmappedChildren = childIds.filter((cid) => !nodeLocationIds.has(cid));
        if (unmappedChildren.length > 0) {
          partialCount++;
        }
      }
    }
  }

  return {
    totalLocations: locations.length,
    mappedCount,
    unmappedCount,
    partialCount,
  };
}

export interface SpatialBreadcrumbEntry {
  id: string;
  code: string;
  name: string;
  kind?: string;
  isCurrent: boolean;
}

/**
 * Builds an ordered array of breadcrumb items from root ancestor to target location.
 * Guards against cyclic references and missing ancestor records.
 */
export function buildSpatialBreadcrumbs(
  currentLocationId: string,
  locations: Array<{
    id: string;
    code: string;
    name: string;
    kind?: string;
    parentId?: string | null;
  }>,
): SpatialBreadcrumbEntry[] {
  if (!currentLocationId || !locations || locations.length === 0) {
    return [];
  }

  const locMap = new Map<string, (typeof locations)[0]>();
  for (const loc of locations) {
    locMap.set(loc.id, loc);
  }

  const current = locMap.get(currentLocationId);
  if (!current) {
    return [];
  }

  const entries: SpatialBreadcrumbEntry[] = [
    {
      id: current.id,
      code: current.code,
      name: current.name,
      kind: current.kind,
      isCurrent: true,
    },
  ];

  const visited = new Set<string>([current.id]);
  let currParentId = current.parentId;

  while (currParentId && !visited.has(currParentId)) {
    visited.add(currParentId);
    const parent = locMap.get(currParentId);
    if (!parent) break;

    entries.unshift({
      id: parent.id,
      code: parent.code,
      name: parent.name,
      kind: parent.kind,
      isCurrent: false,
    });

    currParentId = parent.parentId;
  }

  return entries;
}
