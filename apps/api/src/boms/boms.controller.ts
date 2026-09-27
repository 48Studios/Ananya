import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { BomsService } from './boms.service';
import {
  CreateBomDto,
  UpdateBomDto,
  AddBomLineDto,
  DuplicateBomDto,
} from './dtos';
import { BomExceptionFilter } from './bom-exception.filter';
import type { BomStatus } from '@ananya/manufacturing';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('boms')
@UseFilters(BomExceptionFilter)
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Post()
  @UseGuards(createPermissionGuard('BOM.Manage', 'create bill of materials'))
  create(@Body() dto: CreateBomDto) {
    return this.bomsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('BOM.Read', 'view bills of materials'))
  findAll(
    @Query('componentId') componentId?: string,
    @Query('status') status?: BomStatus,
  ) {
    return this.bomsService.findAll(componentId, status);
  }

  @Get('revisions/:componentId')
  @UseGuards(createPermissionGuard('BOM.Read', 'view bom revisions'))
  findRevisions(@Param('componentId') componentId: string) {
    return this.bomsService.findRevisions(componentId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('BOM.Read', 'view bom by id'))
  findOne(@Param('id') id: string) {
    return this.bomsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('BOM.Manage', 'update bill of materials'))
  update(@Param('id') id: string, @Body() dto: UpdateBomDto) {
    return this.bomsService.update(id, dto);
  }

  @Post(':id/duplicate')
  @UseGuards(createPermissionGuard('BOM.Manage', 'duplicate bill of materials'))
  duplicate(@Param('id') id: string, @Body() dto?: DuplicateBomDto) {
    return this.bomsService.duplicate(id, dto);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('BOM.Manage', 'add bom line'))
  addLine(@Param('id') id: string, @Body() dto: AddBomLineDto) {
    return this.bomsService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  @UseGuards(createPermissionGuard('BOM.Manage', 'remove bom line'))
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.bomsService.removeLine(id, lineId);
  }

  @Post(':id/release')
  @UseGuards(createPermissionGuard('BOM.Manage', 'release bill of materials'))
  release(@Param('id') id: string) {
    return this.bomsService.release(id);
  }

  @Post(':id/obsolete')
  @UseGuards(createPermissionGuard('BOM.Manage', 'obsolete bill of materials'))
  obsolete(@Param('id') id: string) {
    return this.bomsService.obsolete(id);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('BOM.Manage', 'delete bill of materials'))
  delete(@Param('id') id: string) {
    return this.bomsService.delete(id);
  }
}
