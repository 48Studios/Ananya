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
import type { Location } from '@ananya/inventory';
import { CreateLocationDto } from './create-location.dto';
import { UpdateLocationDto } from './update-location.dto';
import { LocationsService } from './locations.service';
import { LocationExceptionFilter } from './location-exception.filter';

@Controller('locations')
@UseFilters(LocationExceptionFilter)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  create(@Body() input: CreateLocationDto): Promise<Location> {
    return this.locationsService.create(input);
  }

  @Get()
  getAll(): Promise<Location[]> {
    return this.locationsService.getAllLocations();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Location> {
    return this.locationsService.getLocation(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() input: UpdateLocationDto,
  ): Promise<Location> {
    return this.locationsService.update(id, input);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.locationsService.delete(id);
  }
}
