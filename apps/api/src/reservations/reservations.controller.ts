import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto, UpdateReservationDto } from './dtos';
import { ReservationExceptionFilter } from './reservation-exception.filter';
import type { ReservationStatus, ReservationType } from '@ananya/inventory';

@Controller('reservations')
@UseFilters(ReservationExceptionFilter)
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Post()
  async create(@Body() dto: CreateReservationDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query('componentId') componentId?: string,
    @Query('locationId') locationId?: string,
    @Query('reservationType') reservationType?: ReservationType,
    @Query('status') status?: ReservationStatus,
    @Query('referenceDocument') referenceDocument?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(
      componentId,
      locationId,
      reservationType,
      status,
      referenceDocument,
      search,
    );
  }

  @Get('available')
  async getAvailable(
    @Query('componentId') componentId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.service.getAvailableQuantity(componentId, locationId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateReservationDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/fulfill')
  async fulfill(@Param('id') id: string) {
    return this.service.fulfill(id);
  }

  @Post(':id/release')
  async release(@Param('id') id: string) {
    return this.service.release(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
