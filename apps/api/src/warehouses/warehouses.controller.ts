import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto, AddBinDto, UpdateBinDto } from './dtos';

@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(dto);
  }

  @Get()
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Post(':id/bins')
  addBin(@Param('id') id: string, @Body() dto: AddBinDto) {
    return this.warehousesService.addBin(id, dto);
  }

  @Patch(':id/bins/:binId')
  updateBin(
    @Param('id') id: string,
    @Param('binId') binId: string,
    @Body() dto: UpdateBinDto,
  ) {
    return this.warehousesService.updateBin(id, binId, dto);
  }
}
