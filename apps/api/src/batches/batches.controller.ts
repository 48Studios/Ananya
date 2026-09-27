import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateBatchDto } from './create-batch.dto';
import { BatchesService } from './batches.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  async findAll() {
    return this.service.getAll();
  }

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Update'))
  async create(@Body() dto: CreateBatchDto) {
    return this.service.create({
      ...dto,
      manufacturingDate: dto.manufacturingDate
        ? new Date(dto.manufacturingDate)
        : null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
    });
  }

  @Get('component/:componentId')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  async findByComponent(@Param('componentId') componentId: string) {
    return this.service.getByComponent(componentId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  async findOne(@Param('id') id: string) {
    const batch = await this.service.getById(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }
    return batch;
  }
}
