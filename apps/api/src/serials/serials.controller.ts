import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CreateSerialDto } from './create-serial.dto';
import { SerialsService } from './serials.service';

@Controller('serials')
export class SerialsController {
  constructor(private readonly service: SerialsService) {}

  @Get()
  async findAll() {
    return this.service.getAll();
  }

  @Post()
  async create(@Body() dto: CreateSerialDto) {
    return this.service.create(dto);
  }

  @Get('component/:componentId')
  async findByComponent(@Param('componentId') componentId: string) {
    return this.service.getByComponent(componentId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const serial = await this.service.getById(id);
    if (!serial) {
      throw new NotFoundException(`Serial with ID ${id} not found`);
    }
    return serial;
  }
}
