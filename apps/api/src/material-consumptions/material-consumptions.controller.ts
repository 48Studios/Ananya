import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { MaterialConsumptionsService } from './material-consumptions.service';
import { CreateMaterialConsumptionDto, AddConsumptionLineDto } from './dtos';

@Controller('material-consumptions')
export class MaterialConsumptionsController {
  constructor(
    private readonly consumptionsService: MaterialConsumptionsService,
  ) {}

  @Post()
  create(@Body() dto: CreateMaterialConsumptionDto) {
    return this.consumptionsService.create(dto);
  }

  @Get()
  findAll(@Query('productionOrderId') productionOrderId?: string) {
    return this.consumptionsService.findAll(productionOrderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.consumptionsService.findOne(id);
  }

  @Post(':id/lines')
  addLine(@Param('id') id: string, @Body() dto: AddConsumptionLineDto) {
    return this.consumptionsService.addLine(id, dto);
  }

  @Post(':id/post')
  post(@Param('id') id: string) {
    return this.consumptionsService.post(id);
  }
}
