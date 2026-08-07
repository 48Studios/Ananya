import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CreateBatchDto } from './create-batch.dto';
import { BatchesService } from './batches.service';

@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

  @Get()
  async findAll() {
    return this.service.getAll();
  }

  @Post()
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
  async findByComponent(@Param('componentId') componentId: string) {
    return this.service.getByComponent(componentId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const batch = await this.service.getById(id);
    if (!batch) {
      throw new NotFoundException(`Batch with ID ${id} not found`);
    }
    return batch;
  }
}
