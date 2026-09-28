import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaterialConsumptionsService } from './material-consumptions.service';
import { CreateMaterialConsumptionDto, AddConsumptionLineDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('material-consumptions')
export class MaterialConsumptionsController {
  constructor(
    private readonly consumptionsService: MaterialConsumptionsService,
  ) {}

  @Post()
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  create(@Body() dto: CreateMaterialConsumptionDto) {
    return this.consumptionsService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  findAll(@Query('productionOrderId') productionOrderId?: string) {
    return this.consumptionsService.findAll(productionOrderId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  findOne(@Param('id') id: string) {
    return this.consumptionsService.findOne(id);
  }

  @Post(':id/lines')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  addLine(@Param('id') id: string, @Body() dto: AddConsumptionLineDto) {
    return this.consumptionsService.addLine(id, dto);
  }

  @Post(':id/post')
  @UseGuards(createPermissionGuard('Manufacturing.Execute'))
  post(@Param('id') id: string) {
    return this.consumptionsService.post(id);
  }
}
