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

@Controller('boms')
@UseFilters(BomExceptionFilter)
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Post()
  create(@Body() dto: CreateBomDto) {
    return this.bomsService.create(dto);
  }

  @Get()
  findAll(
    @Query('componentId') componentId?: string,
    @Query('status') status?: BomStatus,
  ) {
    return this.bomsService.findAll(componentId, status);
  }

  @Get('revisions/:componentId')
  findRevisions(@Param('componentId') componentId: string) {
    return this.bomsService.findRevisions(componentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bomsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBomDto) {
    return this.bomsService.update(id, dto);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Body() dto?: DuplicateBomDto) {
    return this.bomsService.duplicate(id, dto);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddBomLineDto) {
    return this.bomsService.addLine(id, dto);
  }

  @Delete(':id/lines/:lineId')
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.bomsService.removeLine(id, lineId);
  }

  @Post(':id/release')
  release(@Param('id') id: string) {
    return this.bomsService.release(id);
  }

  @Post(':id/obsolete')
  obsolete(@Param('id') id: string) {
    return this.bomsService.obsolete(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.bomsService.delete(id);
  }
}
