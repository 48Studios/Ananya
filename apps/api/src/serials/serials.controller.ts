import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateSerialDto } from './create-serial.dto';
import { SerialsService } from './serials.service';
import { createPermissionGuard } from '../auth/permission.guard';

@Controller('serials')
export class SerialsController {
  constructor(private readonly service: SerialsService) {}

  @Get()
  @UseGuards(createPermissionGuard('Inventory.Read'))
  async findAll() {
    return this.service.getAll();
  }

  @Post()
  @UseGuards(createPermissionGuard('Inventory.Update'))
  async create(@Body() dto: CreateSerialDto) {
    return this.service.create(dto);
  }

  @Get('component/:componentId')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  async findByComponent(@Param('componentId') componentId: string) {
    return this.service.getByComponent(componentId);
  }

  @Get(':id')
  @UseGuards(createPermissionGuard('Inventory.Read'))
  async findOne(@Param('id') id: string) {
    const serial = await this.service.getById(id);
    if (!serial) {
      throw new NotFoundException(`Serial with ID ${id} not found`);
    }
    return serial;
  }
}
