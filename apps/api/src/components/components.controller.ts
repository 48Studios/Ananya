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
import type { Component } from '@ananya/inventory';
import { CreateComponentDto } from './create-component.dto';
import { UpdateComponentDto } from './update-component.dto';
import { ComponentsService } from './components.service';
import { ComponentExceptionFilter } from './component-exception.filter';

@Controller('components')
@UseFilters(ComponentExceptionFilter)
export class ComponentsController {
  constructor(private readonly componentsService: ComponentsService) {}

  @Post()
  create(@Body() input: CreateComponentDto): Promise<Component> {
    return this.componentsService.create(input);
  }

  @Get()
  getAll(): Promise<Component[]> {
    return this.componentsService.getAllComponents();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Component> {
    return this.componentsService.getComponent(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() input: UpdateComponentDto,
  ): Promise<Component> {
    return this.componentsService.update(id, input);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.componentsService.delete(id);
  }
}
