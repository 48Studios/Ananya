import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BulkActionService } from './bulk-action.service';
import { BulkActionDto } from './dtos';
import type {
  BulkActionResultDto,
  BulkActionSupportDto,
} from './bulk-action.dtos';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';
import { PermissionsService } from '../permissions/permissions.service';

export function getRequiredPermissionForBulkAction(
  entityType: string,
  action: string,
): string {
  const normalized = (entityType || '').trim().toLowerCase();
  switch (normalized) {
    case 'role':
    case 'roles':
      return 'Administration.Roles';
    case 'purchaseorder':
    case 'purchaseorders':
      return 'PurchaseOrders.Update';
    case 'bom':
    case 'boms':
      return 'BOM.Manage';
    case 'workorder':
    case 'workorders':
    case 'productionorder':
    case 'productionorders':
      return 'WorkOrders.Manage';
    case 'component':
    case 'components':
      return action === 'DELETE' ? 'Inventory.Delete' : 'Inventory.Update';
    case 'supplier':
    case 'suppliers':
      return 'PurchaseOrders.Update';
    case 'attributedefinition':
    case 'attributedefinitions':
      return action === 'DELETE' ? 'Attributes.Delete' : 'Attributes.Update';
    case 'category':
    case 'categories':
    case 'location':
    case 'locations':
    case 'unit':
    case 'units':
    case 'manufacturer':
    case 'manufacturers':
      return action === 'DELETE' ? 'Inventory.Delete' : 'Inventory.Update';
    default:
      throw new BadRequestException(
        `Bulk actions are not supported for unknown entity type "${entityType}".`,
      );
  }
}

/**
 * Bulk actions on selected records, kept separate from the import/export
 * controller so the file-transfer routes stay readable. Same route prefix, so
 * the existing client paths (`POST /import-export/bulk-action`) are unchanged.
 */
@Controller('import-export')
export class BulkActionsController {
  constructor(
    private readonly bulkActionService: BulkActionService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * What the toolbar is allowed to offer for one entity type. The frontend
   * renders actions from this list, so an action that has no real mutation
   * behind it is never shown.
   */
  @Get('bulk-actions/:entityType')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'query bulk action support'),
  )
  getSupportedActions(
    @Param('entityType') entityType: string,
  ): BulkActionSupportDto {
    return this.bulkActionService.getSupport(entityType);
  }

  @Post('bulk-action')
  executeBulkAction(
    @Body() dto: BulkActionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<BulkActionResultDto> {
    const requiredPermission = getRequiredPermissionForBulkAction(
      dto.entityType,
      dto.action,
    );
    const userPermissions = req.user?.permissions ?? [];
    if (
      !this.permissionsService.hasPermission(
        userPermissions,
        requiredPermission,
      )
    ) {
      throw new ForbiddenException(
        `You do not have permission to execute bulk ${dto.action} on ${dto.entityType} (requires ${requiredPermission}).`,
      );
    }
    return this.bulkActionService.execute(dto);
  }
}
