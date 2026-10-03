import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { SpatialLayoutService } from './spatial-layout.service';
import type {
  SpatialLayoutWithMappings,
  SpatialLayoutRevisionRecordProps,
} from '@ananya/inventory';
import { SpatialExceptionFilter } from './spatial-exception.filter';
import {
  createPermissionGuard,
  type AuthenticatedRequest,
} from '../auth/permission.guard';
import {
  CreateSpatialLayoutDto,
  UpdateSpatialLayoutDto,
  PublishSpatialLayoutDto,
  ArchiveSpatialLayoutDto,
} from './dtos';

@Controller('spatial/layouts')
@UseFilters(SpatialExceptionFilter)
export class SpatialLayoutController {
  constructor(private readonly layoutService: SpatialLayoutService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Update', 'create spatial layout'))
  async createLayout(
    @Body() dto: CreateSpatialLayoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SpatialLayoutWithMappings> {
    return this.layoutService.createLayout(dto, req.user?.id);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read', 'view spatial layouts'))
  async getAllLayouts(
    @Query('parentLocationId') parentLocationId?: string,
  ): Promise<SpatialLayoutWithMappings[]> {
    if (parentLocationId) {
      return this.layoutService.getLayoutsByParent(parentLocationId);
    }
    return [];
  }

  @Get('parent/:parentLocationId')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'view spatial layouts for parent'),
  )
  async getLayoutsByParent(
    @Param('parentLocationId') parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings[]> {
    return this.layoutService.getLayoutsByParent(parentLocationId);
  }

  @Get('parent/:parentLocationId/active')
  @UseGuards(
    createPermissionGuard(
      'Inventory.Read',
      'view active spatial layout for parent',
    ),
  )
  async getActiveLayoutByParent(
    @Param('parentLocationId') parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings | null> {
    return this.layoutService.getActiveLayoutByParent(parentLocationId);
  }

  @Get(':id')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'view spatial layout by id'),
  )
  async getLayoutById(
    @Param('id') id: string,
  ): Promise<SpatialLayoutWithMappings> {
    return this.layoutService.getLayout(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Update', 'update spatial layout'))
  async updateLayout(
    @Param('id') id: string,
    @Body() dto: UpdateSpatialLayoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SpatialLayoutWithMappings> {
    return this.layoutService.updateLayout(id, dto, req.user?.id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    createPermissionGuard('Inventory.Update', 'publish spatial layout'),
  )
  async publishLayout(
    @Param('id') id: string,
    @Body() dto: PublishSpatialLayoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SpatialLayoutWithMappings> {
    return this.layoutService.publishLayout(id, dto, req.user?.id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    createPermissionGuard('Inventory.Update', 'archive spatial layout'),
  )
  async archiveLayout(
    @Param('id') id: string,
    @Body() dto: ArchiveSpatialLayoutDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SpatialLayoutWithMappings> {
    return this.layoutService.archiveLayout(id, dto, req.user?.id);
  }

  @Get(':id/revisions')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'view spatial layout revisions'),
  )
  async getRevisions(
    @Param('id') id: string,
  ): Promise<SpatialLayoutRevisionRecordProps[]> {
    return this.layoutService.getRevisions(id);
  }

  @Get(':id/revisions/:revisionNumber')
  @UseGuards(
    createPermissionGuard(
      'Inventory.Read',
      'view spatial layout revision by number',
    ),
  )
  async getRevisionByNumber(
    @Param('id') id: string,
    @Param('revisionNumber', ParseIntPipe) revisionNumber: number,
  ): Promise<SpatialLayoutRevisionRecordProps> {
    return this.layoutService.getRevisionByNumber(id, revisionNumber);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('Inventory.Update', 'delete spatial layout'))
  async deleteLayout(@Param('id') id: string): Promise<void> {
    return this.layoutService.deleteLayout(id);
  }
}
