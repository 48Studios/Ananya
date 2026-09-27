import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Manufacturer } from '@ananya/inventory';
import { CreateManufacturerDto } from './create-manufacturer.dto';
import { UpdateManufacturerDto } from './update-manufacturer.dto';
import { ManufacturersService } from './manufacturers.service';
import { ManufacturerExceptionFilter } from './manufacturer-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('manufacturers')
@UseFilters(ManufacturerExceptionFilter)
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Create'))
  create(@Body() input: CreateManufacturerDto): Promise<Manufacturer> {
    return this.manufacturersService.create(input);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  getAll(): Promise<Manufacturer[]> {
    return this.manufacturersService.getAllManufacturers();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  get(@Param('id') id: string): Promise<Manufacturer> {
    return this.manufacturersService.getManufacturer(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  update(
    @Param('id') id: string,
    @Body() input: UpdateManufacturerDto,
  ): Promise<Manufacturer> {
    return this.manufacturersService.update(id, input);
  }

  @Delete(':id')
  @UseGuards(createPermissionGuard('Inventory.Update'))
  delete(@Param('id') id: string): Promise<void> {
    return this.manufacturersService.delete(id);
  }
}
