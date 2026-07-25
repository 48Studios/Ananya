import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { BomsService } from './boms.service';
import { CreateBomDto, AddBomLineDto } from './dtos';
import { BomStatus } from '@ananya/manufacturing';

@Controller('boms')
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bomsService.findOne(id);
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
}
