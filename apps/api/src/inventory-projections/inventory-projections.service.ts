import { Inject, Injectable } from '@nestjs/common';
import {
  RebuildInventoryProjections,
  type InventoryProjection,
  type InventoryProjectionRepository,
  type InventoryTransactionRepository,
  type LocationRepository,
} from '@ananya/inventory';
import { INVENTORY_PROJECTION_REPOSITORY } from './inventory-projection.tokens';
import { INVENTORY_TRANSACTION_REPOSITORY } from '../inventory-transactions/inventory-transaction.tokens';
import { LOCATION_REPOSITORY } from '../locations/location.tokens';

@Injectable()
export class InventoryProjectionsService {
  constructor(
    @Inject(INVENTORY_PROJECTION_REPOSITORY)
    private readonly projectionRepository: InventoryProjectionRepository,
    @Inject(INVENTORY_TRANSACTION_REPOSITORY)
    private readonly transactionRepository: InventoryTransactionRepository,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepository,
  ) {}

  async getByComponentAndLocation(
    componentId: string,
    locationId: string,
  ): Promise<InventoryProjection | null> {
    return this.projectionRepository.findByComponentAndLocation(
      componentId,
      locationId,
    );
  }

  async getByComponent(componentId: string): Promise<InventoryProjection[]> {
    return this.projectionRepository.findManyByComponent(componentId);
  }

  /**
   * Returns projections at the given location **and** every descendant location
   * in the hierarchy.  This gives each ancestor location an aggregated view of
   * all components stored anywhere in its subtree.
   *
   * The implementation loads the full location list once (single query) and
   * resolves the subtree in-memory, then queries projections for the complete
   * set of location IDs in a single `IN (…)` query — no N+1.
   */
  async getByLocation(locationId: string): Promise<InventoryProjection[]> {
    const allLocations = await this.locationRepository.findMany();

    // Build a parent → children index for fast traversal.
    const childrenByParent = new Map<string, string[]>();
    for (const loc of allLocations) {
      if (loc.parentId) {
        const siblings = childrenByParent.get(loc.parentId);
        if (siblings) {
          siblings.push(loc.id);
        } else {
          childrenByParent.set(loc.parentId, [loc.id]);
        }
      }
    }

    // BFS to collect every descendant ID (including locationId itself).
    const subtreeIds: string[] = [locationId];
    const queue: string[] = [locationId];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const children = childrenByParent.get(current);
      if (children) {
        for (const childId of children) {
          subtreeIds.push(childId);
          queue.push(childId);
        }
      }
    }

    return this.projectionRepository.findManyByLocations(subtreeIds);
  }

  async rebuild(): Promise<void> {
    const rebuildUseCase = new RebuildInventoryProjections(
      this.transactionRepository,
      this.projectionRepository,
    );
    await rebuildUseCase.execute();
  }
}
