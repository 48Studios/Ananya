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
import { ComponentSkuPreviewService } from './component-sku-preview.service';

import { MlService } from '../ml/ml.service';
import {
  SuggestComponentDto,
  ComponentSuggestionResponseDto,
  CreateMlFeedbackDto,
} from '../ml/dtos';

@Controller('components')
@UseFilters(ComponentExceptionFilter)
export class ComponentsController {
  constructor(
    private readonly componentsService: ComponentsService,
    private readonly mlService: MlService,
    private readonly componentSkuPreviewService: ComponentSkuPreviewService,
  ) {}

  @Post('suggest')
  suggest(
    @Body() input: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    return this.mlService.suggest(input);
  }

  @Get('sku/preview')
  previewSku(): Promise<string> {
    return this.componentSkuPreviewService.preview();
  }

  @Post('suggest/feedback')
  recordFeedback(@Body() input: CreateMlFeedbackDto) {
    return this.mlService.recordFeedback(input);
  }

  @Post()
  create(
    @Body() input: CreateComponentDto,
  ): Promise<Component & { attributes?: Record<string, any> }> {
    return this.componentsService.create(input);
  }

  @Get()
  getAll(): Promise<(Component & { attributes?: Record<string, any> })[]> {
    return this.componentsService.getAllComponents();
  }

  @Get(':id')
  get(
    @Param('id') id: string,
  ): Promise<Component & { attributes: Record<string, any> }> {
    return this.componentsService.getComponent(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() input: UpdateComponentDto,
  ): Promise<Component & { attributes?: Record<string, any> }> {
    return this.componentsService.update(id, input);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.componentsService.delete(id);
  }
}
