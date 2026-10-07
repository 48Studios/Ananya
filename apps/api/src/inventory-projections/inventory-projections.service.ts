import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  RebuildInventoryProjections,
  collectPhysicalSubtreeIds,
  type InventoryProjection,
  type InventoryProjectionRepository,
  type InventoryTransactionRepository,
  type LocationRepository,
} from '@ananya/inventory';
import { INVENTORY_PROJECTION_REPOSITORY } from './inventory-projection.tokens';
import { INVENTORY_TRANSACTION_REPOSITORY } from '../inventory-transactions/inventory-transaction.tokens';
import { LOCATION_REPOSITORY } from '../locations/location.tokens';
import { InventoryAlertsService } from '../inventory-alerts/inventory-alerts.service';

@Injectable()
export class InventoryProjectionsService {
  private readonly logger = new Logger(InventoryProjectionsService.name);

  constructor(
    @Inject(INVENTORY_PROJECTION_REPOSITORY)
    private readonly projectionRepository: InventoryProjectionRepository,
    @Inject(INVENTORY_TRANSACTION_REPOSITORY)
    private readonly transactionRepository: InventoryTransactionRepository,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepository,
    // Optional so unit tests can construct the service without the alerting
    // subsystem; the module always provides it in the running application.
    @Optional()
    private readonly inventoryAlertsService?: InventoryAlertsService,
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
   * Returns projections at the given location **and** every location physically
   * contained beneath it (RFC-0069 Phase 4). Physical stock aggregation follows
   * physical containment, not the organizational hierarchy.
   *
   * The implementation loads the full location list once (single query) and
   * resolves the subtree in-memory, then queries projections for the complete
   * set of location IDs in a single `IN (…)` query — no N+1.
   */
  async getByLocation(locationId: string): Promise<InventoryProjection[]> {
    const allLocations = await this.locationRepository.findMany();

    // RFC-0069 Phase 4A: the physical rollup follows PHYSICAL containment
    // (`containerId`), never the organizational hierarchy (`parentId`).
    // `collectPhysicalSubtreeIds` is containerId-authoritative. A NULL containerId
    // means the location is not physically contained in another location.
    // Transitional fallback is removed from the production rollup path.
    const subtreeIds = collectPhysicalSubtreeIds(locationId, allLocations);

    return this.projectionRepository.findManyByLocations(subtreeIds);
  }

  async rebuild(): Promise<void> {
    const rebuildUseCase = new RebuildInventoryProjections(
      this.transactionRepository,
      this.projectionRepository,
    );
    await rebuildUseCase.execute();
    await this.evaluateAlertsAfterStockChange();
  }

  /**
   * Every stock-changing operation rebuilds projections, which makes this the
   * single choke point for re-evaluating inventory alerts. Alerting must never
   * fail the stock operation that triggered it: failures are logged and the
   * scheduled reconciliation retries.
   */
  private async evaluateAlertsAfterStockChange(): Promise<void> {
    if (!this.inventoryAlertsService) return;
    try {
      await this.inventoryAlertsService.evaluate();
    } catch (error: unknown) {
      this.logger.error(
        `Inventory alert evaluation after projection rebuild failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
