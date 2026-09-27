import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportExportService } from './import-export.service';
import { ExportRequestDto, ExportResponseDto, UploadedFileObj } from './dtos';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';
import { PermissionsService } from '../permissions/permissions.service';

export function getRequiredPermissionForEntityImport(entityType: string): string {
  const norm = (entityType || '').trim().toLowerCase();
  switch (norm) {
    case 'user':
    case 'users':
      return 'Administration.Users';
    case 'role':
    case 'roles':
    case 'permission':
    case 'permissions':
      return 'Administration.Roles';
    case 'purchaseorder':
    case 'purchaseorders':
      return 'PurchaseOrders.Update';
    case 'bom':
    case 'boms':
    case 'billofmaterials':
      return 'BOM.Manage';
    case 'workorder':
    case 'workorders':
    case 'productionorder':
    case 'productionorders':
      return 'WorkOrders.Manage';
    case 'attributedefinition':
    case 'attributedefinitions':
    case 'attribute':
    case 'attributes':
      return 'Attributes.Update';
    case 'component':
    case 'components':
    case 'category':
    case 'categories':
    case 'supplier':
    case 'suppliers':
    case 'manufacturer':
    case 'manufacturers':
    case 'warehouse':
    case 'warehouses':
    case 'warehousebin':
    case 'warehousebins':
    case 'location':
    case 'locations':
    case 'unit':
    case 'units':
    case 'openinginventory':
    case 'stockadjustment':
    case 'stockadjustments':
    case 'customer':
    case 'customers':
    case 'project':
    case 'projects':
    case 'task':
    case 'tasks':
    case 'asset':
    case 'equipment':
    case 'maintenanceschedule':
    case 'servicerequest':
    case 'warranty':
    case 'rma':
      return 'Inventory.Update';
    default:
      throw new BadRequestException(
        `Unknown or unsupported import entity type "${entityType}".`,
      );
  }
}

export function getRequiredPermissionForEntityExport(
  entityType: string,
): string | null {
  const norm = (entityType || '').trim().toLowerCase();
  switch (norm) {
    case 'user':
    case 'users':
      return 'Administration.Users';
    case 'role':
    case 'roles':
    case 'permission':
    case 'permissions':
      return 'Administration.Roles';
    case 'purchaseorder':
    case 'purchaseorders':
      return 'PurchaseOrders.Read';
    case 'bom':
    case 'boms':
    case 'billofmaterials':
      return 'BOM.Read';
    case 'workorder':
    case 'workorders':
    case 'productionorder':
    case 'productionorders':
      return 'WorkOrders.Read';
    default:
      return null;
  }
}

@Controller('import-export')
export class ImportExportController {
  private readonly logger = new Logger(ImportExportController.name);

  constructor(
    private readonly service: ImportExportService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private checkEntityImportPermission(
    entityType: string,
    req: AuthenticatedRequest,
  ): void {
    const requiredPermission = getRequiredPermissionForEntityImport(entityType);
    const userPermissions = req.user?.permissions ?? [];
    if (
      !this.permissionsService.hasPermission(
        userPermissions,
        requiredPermission,
      )
    ) {
      throw new ForbiddenException(
        `You do not have permission to import ${entityType} (requires ${requiredPermission}).`,
      );
    }
  }

  @Get('template/:entityType')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'download import template'),
  )
  getTemplate(
    @Param('entityType') entityType: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.checkEntityImportPermission(entityType, req);
    return this.service.getTemplate(entityType);
  }

  @Get('template/:entityType/csv')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'download import template'),
  )
  getTemplateCsv(
    @Param('entityType') entityType: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.checkEntityImportPermission(entityType, req);
    const csv = this.service.getTemplateCsv(entityType);
    const expressReq = req as unknown as Request;
    if (expressReq.res) {
      expressReq.res.setHeader('Content-Type', 'text/csv');
      expressReq.res.setHeader(
        'Content-Disposition',
        `attachment; filename="${entityType.toLowerCase()}_template.csv"`,
      );
    }
    return csv;
  }

  @Get('template/:entityType/xlsx')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'download import template'),
  )
  getTemplateXlsx(
    @Param('entityType') entityType: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.checkEntityImportPermission(entityType, req);
    const xlsxContent = this.service.getTemplateXlsx(entityType);
    const expressReq = req as unknown as Request;
    if (expressReq.res) {
      expressReq.res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expressReq.res.setHeader(
        'Content-Disposition',
        `attachment; filename="${entityType.toLowerCase()}_template.xlsx"`,
      );
    }
    return xlsxContent;
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(
    @UploadedFile() file: UploadedFileObj,
    @Body('entityType') entityType: string,
    @Req() req: AuthenticatedRequest,
  ) {
    this.logger.log(
      `[IMPORT PREVIEW REQUEST] Received file: "${file?.originalname}", size: ${file?.size} bytes, mimetype: "${file?.mimetype}", entityType: "${entityType}"`,
    );

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    if (!entityType) {
      throw new BadRequestException('Missing required parameter: entityType');
    }

    this.checkEntityImportPermission(entityType, req);
    return this.service.previewImport(file, entityType);
  }

  @Post('import/execute')
  @UseInterceptors(FileInterceptor('file'))
  async executeImport(
    @UploadedFile() file: UploadedFileObj,
    @Body('entityType') entityType: string,
    @Body('columnMapping') columnMappingStr: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }

    this.logger.log(
      `[IMPORT EXECUTE REQUEST] Received file: "${file?.originalname}", size: ${file?.size} bytes, entityType: "${entityType}", userId: "${userId}"`,
    );

    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException('No file uploaded or file is empty');
    }

    if (!entityType) {
      throw new BadRequestException('Missing required parameter: entityType');
    }

    this.checkEntityImportPermission(entityType, req);

    let columnMapping: Record<string, string> = {};
    if (columnMappingStr) {
      try {
        columnMapping = JSON.parse(columnMappingStr) as Record<string, string>;
      } catch {
        this.logger.warn(
          `Failed to parse column mapping string: ${columnMappingStr}`,
        );
      }
    }

    return this.service.executeImport(file, entityType, columnMapping, userId);
  }

  @Post('export')
  @UseGuards(createPermissionGuard('Reports.Export', 'export system data'))
  async executeExport(
    @Body() dto: ExportRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExportResponseDto> {
    const specificPerm = getRequiredPermissionForEntityExport(dto.entityType);
    if (specificPerm) {
      const userPermissions = req.user?.permissions ?? [];
      if (
        !this.permissionsService.hasPermission(userPermissions, specificPerm)
      ) {
        throw new ForbiddenException(
          `You do not have permission to export ${dto.entityType} (requires ${specificPerm}).`,
        );
      }
    }
    return await this.service.executeExport(dto);
  }

  @Get('jobs')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view import/export jobs'))
  async getJobs(@Req() req: AuthenticatedRequest) {
    const userPermissions = req.user?.permissions ?? [];
    const isAuditorOrAdmin =
      userPermissions.includes('*') ||
      userPermissions.includes('Administration.Security') ||
      userPermissions.includes('Administration.Users');

    const targetUserId = isAuditorOrAdmin ? undefined : req.user!.id;
    return await this.service.getJobs(targetUserId);
  }

  @Get('jobs/:id')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view import/export jobs'))
  async getJob(@Param('id') id: string) {
    return await this.service.getJob(id);
  }

  @Post('jobs/:id/reverse')
  @UseGuards(createPermissionGuard('Inventory.Update', 'reverse import job'))
  async reverseImport(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }
    const job = await this.service.getJob(id);
    this.checkEntityImportPermission(job.entityType, req);
    return await this.service.reverseImport(id, userId);
  }
}
