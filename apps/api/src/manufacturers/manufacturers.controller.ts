import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseFilters,
} from '@nestjs/common';
import type { Manufacturer } from '@ananya/inventory';
import { CreateManufacturerDto } from './create-manufacturer.dto';
import { UpdateManufacturerDto } from './update-manufacturer.dto';
import { ManufacturersService } from './manufacturers.service';
import { ManufacturerExceptionFilter } from './manufacturer-exception.filter';

@Controller('manufacturers')
@UseFilters(ManufacturerExceptionFilter)
export class ManufacturersController {
  constructor(private readonly manufacturersService: ManufacturersService) {}

  @Post()
  create(@Body() input: CreateManufacturerDto): Promise<Manufacturer> {
    return this.manufacturersService.create(input);
  }

  @Get()
  getAll(): Promise<Manufacturer[]> {
    return this.manufacturersService.getAllManufacturers();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Manufacturer> {
    return this.manufacturersService.getManufacturer(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() input: UpdateManufacturerDto,
  ): Promise<Manufacturer> {
    return this.manufacturersService.update(id, input);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.manufacturersService.delete(id);
  }
}
