import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
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
import {
  ComponentDeleteGuard,
  ComponentReadGuard,
  ComponentWriteGuard,
  type AuthenticatedRequest,
} from '../auth/component-permissions';

/**
 * Component catalog API.
 *
 * Route security audit (Pass 6). Every route on this controller was previously
 * unguarded — the largest unauthenticated surface in the API. Any caller, with or
 * without a session, could read the whole catalog, create components, edit them,
 * delete them, and write AI suggestion feedback.
 *
 * | Route | Class | Guard |
 * | --- | --- | --- |
 * | `POST /components/suggest` | AUTHENTICATED READ/COMPUTE | `ComponentReadGuard` |
 * | `GET  /components/sku/preview` | AUTHENTICATED READ | `ComponentReadGuard` |
 * | `POST /components/suggest/feedback` | AUTHENTICATED WRITE | `ComponentWriteGuard` |
 * | `POST /components` | AUTHENTICATED WRITE | `ComponentWriteGuard` |
 * | `GET  /components` | AUTHENTICATED READ | `ComponentReadGuard` |
 * | `GET  /components/:id` | AUTHENTICATED READ | `ComponentReadGuard` |
 * | `PUT  /components/:id` | AUTHENTICATED WRITE | `ComponentWriteGuard` |
 * | `DELETE /components/:id` | AUTHENTICATED WRITE | `ComponentDeleteGuard` |
 *
 * `POST /components/suggest` is a read that costs money: it reads categories,
 * manufacturers and existing components, and can make an outbound model call. It
 * therefore requires `Inventory.Read` rather than being left open on the reasoning
 * that it "only computes".
 *
 * `POST /components/suggest/feedback` was the highest-priority gap: it reaches the
 * same `MlService.recordFeedback` persistence path as `POST /ml/feedback`, which
 * Pass 5 guarded. Guarding the `/ml/*` alias alone left the write reachable here.
 * The actor is now taken from the authenticated session, never the body.
 *
 * There are no deprecated routes on this controller and no internal-only routes:
 * every one of them is called by the web client.
 */
@Controller('components')
@UseFilters(ComponentExceptionFilter)
export class ComponentsController {
  constructor(
    private readonly componentsService: ComponentsService,
    private readonly mlService: MlService,
    private readonly componentSkuPreviewService: ComponentSkuPreviewService,
  ) {}

  @Post('suggest')
  @UseGuards(ComponentReadGuard)
  suggest(
    @Body() input: SuggestComponentDto,
  ): Promise<ComponentSuggestionResponseDto> {
    return this.mlService.suggest(input);
  }

  @Get('sku/preview')
  @UseGuards(ComponentReadGuard)
  previewSku(): Promise<string> {
    return this.componentSkuPreviewService.preview();
  }

  /**
   * Records AI suggestion telemetry.
   *
   * Writes `ai_suggestion_feedback`, the labeled dataset behind model retraining.
   * The actor comes from the authenticated session; the request body carries no
   * reviewer field and `forbidNonWhitelisted` rejects one if supplied, so a spoofed
   * identity cannot be recorded.
   */
  @Post('suggest/feedback')
  @UseGuards(ComponentWriteGuard)
  recordFeedback(
    @Body() input: CreateMlFeedbackDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = req?.user || {};
    return this.mlService.recordFeedback(input, user);
  }

  @Post()
  @UseGuards(ComponentWriteGuard)
  create(
    @Body() input: CreateComponentDto,
  ): Promise<Component & { attributes?: Record<string, any> }> {
    return this.componentsService.create(input);
  }

  @Get()
  @UseGuards(ComponentReadGuard)
  getAll(): Promise<(Component & { attributes?: Record<string, any> })[]> {
    return this.componentsService.getAllComponents();
  }

  @Get(':id')
  @UseGuards(ComponentReadGuard)
  get(
    @Param('id') id: string,
  ): Promise<Component & { attributes: Record<string, any> }> {
    return this.componentsService.getComponent(id);
  }

  @Put(':id')
  @UseGuards(ComponentWriteGuard)
  update(
    @Param('id') id: string,
    @Body() input: UpdateComponentDto,
  ): Promise<Component & { attributes?: Record<string, any> }> {
    return this.componentsService.update(id, input);
  }

  @Delete(':id')
  @UseGuards(ComponentDeleteGuard)
  delete(@Param('id') id: string): Promise<void> {
    return this.componentsService.delete(id);
  }
}
