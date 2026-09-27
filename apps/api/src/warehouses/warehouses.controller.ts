import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, AddBinDto, UpdateBinDto } from './dtos';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Update'))
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Post(':id/bins')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  addBin(@Param('id') id: string, @Body() dto: AddBinDto) {
    return this.warehousesService.addBin(id, dto);
  }

  @Patch(':id/bins/:binId')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  updateBin(
    @Param('id') id: string,
    @Param('binId') binId: string,
    @Body() dto: UpdateBinDto,
  ) {
    return this.warehousesService.updateBin(id, binId, dto);
  }
}
