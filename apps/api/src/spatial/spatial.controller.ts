import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  SpatialModel,
  SpatialAnchor,
  SpatialNode,
} from '@ananya/inventory';
import {
  SpatialService,
  type LocationSpatialContext,
  type LocationOperationalView,
  type LocationMappingContext,
  type LocationLocateTarget,
  type ComponentLocateResolution,
} from './spatial.service';
import { SpatialExceptionFilter } from './spatial-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';
import {
  CreateSpatialModelDto,
  UpdateSpatialModelDto,
  CreateSpatialAnchorDto,
  UpdateSpatialAnchorDto,
  CreateSpatialNodeDto,
  UpdateSpatialNodeDto,
} from './dtos';

@Controller('spatial')
@UseFilters(SpatialExceptionFilter)
export class SpatialController {
  constructor(private readonly spatialService: SpatialService) {}

  // ==========================================
  // Spatial Models
  // ==========================================

  @Get('models')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view spatial models'))
  getAllModels(@Query('isActive') isActive?: string): Promise<SpatialModel[]> {
    const filter =
      isActive !== undefined ? { isActive: isActive === 'true' } : undefined;
    return this.spatialService.getAllModels(filter);
  }

  @Get('models/:id')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'view spatial model by id'),
  )
  getModel(@Param('id') id: string): Promise<SpatialModel> {
    return this.spatialService.getModel(id);
  }

  @Post('models')
  @UseGuards(createPermissionGuard('Inventory.Update', 'create spatial model'))
  createModel(@Body() dto: CreateSpatialModelDto): Promise<SpatialModel> {
    return this.spatialService.createModel(dto);
  }

  @Patch('models/:id')
  @UseGuards(createPermissionGuard('Inventory.Update', 'update spatial model'))
  updateModel(
    @Param('id') id: string,
    @Body() dto: UpdateSpatialModelDto,
  ): Promise<SpatialModel> {
    return this.spatialService.updateModel(id, dto);
  }

  @Delete('models/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('Inventory.Update', 'delete spatial model'))
  deleteModel(@Param('id') id: string): Promise<void> {
    return this.spatialService.deleteModel(id);
  }

  // ==========================================
  // Spatial Anchors
  // ==========================================

  @Get('models/:modelId/anchors')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view anchors for model'))
  getAnchorsByModel(
    @Param('modelId') modelId: string,
  ): Promise<SpatialAnchor[]> {
    return this.spatialService.getAnchorsByModel(modelId);
  }

  @Post('models/:modelId/anchors')
  @UseGuards(
    createPermissionGuard('Inventory.Update', 'create anchor on model'),
  )
  createAnchor(
    @Param('modelId') modelId: string,
    @Body() dto: CreateSpatialAnchorDto,
  ): Promise<SpatialAnchor> {
    return this.spatialService.createAnchor(modelId, dto);
  }

  @Get('anchors/:id')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view anchor by id'))
  getAnchor(@Param('id') id: string): Promise<SpatialAnchor> {
    return this.spatialService.getAnchor(id);
  }

  @Patch('anchors/:id')
  @UseGuards(createPermissionGuard('Inventory.Update', 'update spatial anchor'))
  updateAnchor(
    @Param('id') id: string,
    @Body() dto: UpdateSpatialAnchorDto,
  ): Promise<SpatialAnchor> {
    return this.spatialService.updateAnchor(id, dto);
  }

  @Delete('anchors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('Inventory.Update', 'delete spatial anchor'))
  deleteAnchor(@Param('id') id: string): Promise<void> {
    return this.spatialService.deleteAnchor(id);
  }

  // ==========================================
  // Spatial Nodes
  // ==========================================

  @Get('nodes')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view all spatial nodes'))
  getAllNodes(): Promise<SpatialNode[]> {
    return this.spatialService.getAllNodes();
  }

  @Get('nodes/:id')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view spatial node by id'))
  getNode(@Param('id') id: string): Promise<SpatialNode> {
    return this.spatialService.getNode(id);
  }

  @Get('nodes/location/:locationId')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'view spatial node by location'),
  )
  async getNodeByLocation(
    @Param('locationId') locationId: string,
  ): Promise<SpatialNode | null> {
    return this.spatialService.getNodeByLocation(locationId);
  }

  @Post('nodes')
  @UseGuards(createPermissionGuard('Inventory.Update', 'create spatial node'))
  createNode(@Body() dto: CreateSpatialNodeDto): Promise<SpatialNode> {
    return this.spatialService.createNode(dto);
  }

  @Patch('nodes/:id')
  @UseGuards(createPermissionGuard('Inventory.Update', 'update spatial node'))
  updateNode(
    @Param('id') id: string,
    @Body() dto: UpdateSpatialNodeDto,
  ): Promise<SpatialNode> {
    return this.spatialService.updateNode(id, dto);
  }

  @Delete('nodes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('Inventory.Update', 'delete spatial node'))
  deleteNode(@Param('id') id: string): Promise<void> {
    return this.spatialService.deleteNode(id);
  }

  // ==========================================
  // Composite Location Spatial Representation
  // ==========================================

  @Get('locations/:locationId/operational-view')
  @UseGuards(
    createPermissionGuard(
      'Inventory.Read',
      'view location operational 2D view',
    ),
  )
  getLocationOperationalView(
    @Param('locationId') locationId: string,
  ): Promise<LocationOperationalView> {
    return this.spatialService.getLocationOperationalView(locationId);
  }

  @Get('locations/:locationId/mapping-context')
  @UseGuards(
    createPermissionGuard(
      'Inventory.Read',
      'view location spatial mapping context',
    ),
  )
  getLocationMappingContext(
    @Param('locationId') locationId: string,
  ): Promise<LocationMappingContext> {
    return this.spatialService.getLocationMappingContext(locationId);
  }

  @Get('locations/:locationId')
  @UseGuards(
    createPermissionGuard('Inventory.Read', 'view location spatial context'),
  )
  getLocationSpatialContext(
    @Param('locationId') locationId: string,
  ): Promise<LocationSpatialContext> {
    return this.spatialService.getLocationSpatialContext(locationId);
  }

  // ==========================================
  // Search -> Locate Target Resolution
  // ==========================================

  @Get('locate-targets/component/:componentId')
  @UseGuards(
    createPermissionGuard(
      'Inventory.Read',
      'resolve component spatial locate targets',
    ),
  )
  resolveComponentLocate(
    @Param('componentId') componentId: string,
  ): Promise<ComponentLocateResolution> {
    return this.spatialService.resolveComponentLocate(componentId);
  }

  @Get('locate-targets/location/:locationId')
  @UseGuards(
    createPermissionGuard(
      'Inventory.Read',
      'resolve location spatial locate target',
    ),
  )
  resolveLocationLocate(
    @Param('locationId') locationId: string,
    @Query('componentId') componentId?: string,
  ): Promise<LocationLocateTarget> {
    return this.spatialService.resolveLocationLocate(locationId, componentId);
  }
}
