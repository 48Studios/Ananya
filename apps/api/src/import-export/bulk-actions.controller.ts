import {
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

function getRequiredPermissionForBulkAction(
  entityType: string,
  action: string,
): string {
  switch (entityType) {
    case 'roles':
      return 'Administration.Roles';
    case 'purchaseOrders':
      return 'PurchaseOrders.Update';
    case 'boms':
      return 'BOM.Manage';
    case 'productionOrders':
      return 'WorkOrders.Manage';
    case 'components':
      return action === 'DELETE' ? 'Inventory.Delete' : 'Inventory.Update';
    case 'suppliers':
      return 'PurchaseOrders.Update';
    default:
      return 'Inventory.Update';
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
