import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { DomainError } from '@ananya/core';
import { AttributesService } from '../attributes/attributes.service';
import { BomsService } from '../boms/boms.service';
import { CategoriesService } from '../categories/categories.service';
import { ComponentsService } from '../components/components.service';
import { LocationsService } from '../locations/locations.service';
import { ManufacturersService } from '../manufacturers/manufacturers.service';
import { ProductionOrdersService } from '../production-orders/production-orders.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { RolesService } from '../roles/roles.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { UnitsService } from '../units/units.service';
import { BulkActionDto, BulkActionType } from './dtos';
import type {
  BulkActionItemResult,
  BulkActionOutcome,
  BulkActionResultDto,
  BulkActionSupportDto,
} from './bulk-action.dtos';
import {
  MAX_BULK_ACTION_IDS,
  isBulkActionSupported,
  supportedBulkActions,
} from './bulk-action-registry';

/**
 * Carries out bulk actions by delegating to the owning module's own service.
 *
 * Nothing here writes to a table directly: this is an orchestration layer over
 * the same domain operations the single-record screens use, so a bulk delete
 * cannot skip a refusal rule and a bulk archive cannot invent a state
 * transition the module does not already support.
 */
@Injectable()
export class BulkActionService {
  constructor(
    private readonly attributesService: AttributesService,
    private readonly categoriesService: CategoriesService,
    private readonly componentsService: ComponentsService,
    private readonly manufacturersService: ManufacturersService,
    private readonly suppliersService: SuppliersService,
    private readonly locationsService: LocationsService,
    private readonly unitsService: UnitsService,
    private readonly rolesService: RolesService,
    private readonly bomsService: BomsService,
    private readonly productionOrdersService: ProductionOrdersService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  getSupport(entityType: string): BulkActionSupportDto {
    return { entityType, supportedActions: supportedBulkActions(entityType) };
  }

  async execute(dto: BulkActionDto): Promise<BulkActionResultDto> {
    const { entityType, action } = dto;

    if (!isBulkActionSupported(entityType, action)) {
      const supported = supportedBulkActions(entityType);
      throw new BadRequestException(
        supported.length === 0
          ? `Bulk actions are not supported for "${entityType}".`
          : `Bulk action "${action}" is not supported for "${entityType}". Supported: ${supported.join(', ')}.`,
      );
    }

    // A selection can legitimately arrive twice (a row picked on two pages of
    // the same list); acting on it once is what the reviewer means.
    const ids = [...new Set(dto.ids)];
    if (ids.length > MAX_BULK_ACTION_IDS) {
      throw new BadRequestException(
        `A bulk action can carry at most ${MAX_BULK_ACTION_IDS} records per request (received ${ids.length}).`,
      );
    }

    const results: BulkActionItemResult[] = [];
    for (const id of ids) {
      try {
        await this.applyOne(entityType, action, id);
        results.push({ id, outcome: 'APPLIED', reason: null });
      } catch (error) {
        const { outcome, reason } = classifyBulkActionFailure(error);
        results.push({ id, outcome, reason });
      }
    }

    return {
      entityType,
      action,
      requestedCount: ids.length,
      appliedCount: results.filter((r) => r.outcome === 'APPLIED').length,
      skippedCount: results.filter((r) => r.outcome === 'SKIPPED').length,
      failedCount: results.filter((r) => r.outcome === 'FAILED').length,
      results,
    };
  }

  /**
   * One record, one mutation. Every entity type in `BULK_ACTION_SUPPORT` has a
   * branch here; an unlisted pair is refused before this method is reached.
   */
  private async applyOne(
    entityType: string,
    action: BulkActionType,
    id: string,
  ): Promise<void> {
    const isDelete = action === BulkActionType.DELETE;
    const isActive = action === BulkActionType.UPDATE_STATUS;

    switch (entityType) {
      case 'AttributeDefinition':
        if (isDelete) {
          await this.attributesService.deleteDefinition(id);
          return;
        }
        await this.attributesService.updateDefinition(id, { isActive });
        return;
      case 'Category':
        if (isDelete) {
          await this.categoriesService.delete(id);
          return;
        }
        await this.categoriesService.update(id, { isActive });
        return;
      case 'Component':
        if (isDelete) {
          await this.componentsService.delete(id);
          return;
        }
        await this.componentsService.update(id, { isActive });
        return;
      case 'Manufacturer':
        if (isDelete) {
          await this.manufacturersService.delete(id);
          return;
        }
        await this.manufacturersService.update(id, { isActive });
        return;
      case 'Supplier':
        if (isDelete) {
          await this.suppliersService.delete(id);
          return;
        }
        await this.suppliersService.update(id, { isActive });
        return;
      case 'Location':
        if (isDelete) {
          await this.locationsService.delete(id);
          return;
        }
        await this.locationsService.update(id, { isActive });
        return;
      case 'Unit':
        if (isDelete) {
          await this.unitsService.delete(id);
          return;
        }
        await this.unitsService.update(id, { isActive });
        return;
      case 'Role':
        await this.rolesService.delete(id);
        return;
      case 'BOM':
        await this.bomsService.delete(id);
        return;
      case 'WorkOrder':
        await this.productionOrdersService.delete(id);
        return;
      case 'PurchaseOrder':
        await this.purchaseOrdersService.delete(id);
        return;
      default:
        throw new BadRequestException(
          `Bulk actions are not supported for "${entityType}".`,
        );
    }
  }
}

/**
 * A refusal is not a failure: the record was left untouched because a domain
 * rule (or a not-found check) said no, and the reviewer needs to read why.
 * Anything else — a database error, a programming fault — is a failure.
 */
export function classifyBulkActionFailure(error: unknown): {
  outcome: BulkActionOutcome;
  reason: string;
} {
  if (error instanceof DomainError || error instanceof HttpException) {
    return { outcome: 'SKIPPED', reason: error.message };
  }
  return {
    outcome: 'FAILED',
    reason: error instanceof Error ? error.message : 'Unknown error',
  };
}
