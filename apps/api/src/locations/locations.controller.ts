import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Location } from '@ananya/inventory';
import { CreateLocationDto } from './create-location.dto';
import { UpdateLocationDto } from './update-location.dto';
import { LocationsService } from './locations.service';
import { LocationExceptionFilter } from './location-exception.filter';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('locations')
@UseFilters(LocationExceptionFilter)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Create', 'create location'))
  create(@Body() input: CreateLocationDto): Promise<Location> {
    return this.locationsService.create(input);
  }

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read', 'view locations'))
  getAll(): Promise<Location[]> {
    return this.locationsService.getAllLocations();
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read', 'view location by id'))
  get(@Param('id') id: string): Promise<Location> {
    return this.locationsService.getLocation(id);
  }

  @Put(':id')
  @UseGuards(createPermissionGuard('Inventory.Update', 'update location'))
  update(
    @Param('id') id: string,
    @Body() input: UpdateLocationDto,
  ): Promise<Location> {
    return this.locationsService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(createPermissionGuard('Inventory.Delete', 'delete location'))
  delete(@Param('id') id: string): Promise<void> {
    return this.locationsService.delete(id);
  }
}
