import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { BarcodesService, EntityType } from './barcodes.service';

export class GenerateBarcodeDto {
  entityType!: EntityType;
  entityId!: string;
}

export class BatchLabelsDto {
  entityType!: EntityType;
  ids!: string[];
}

@Controller('barcodes')
export class BarcodesController {
  constructor(private readonly barcodesService: BarcodesService) {}

  @Get('lookup')
  lookup(@Query('code') code: string) {
    if (!code) {
      throw new BadRequestException('Query parameter "code" is required.');
    }
    return this.barcodesService.lookup(code);
  }

  @Post('generate')
  generate(@Body() dto: GenerateBarcodeDto) {
    if (!dto.entityType || !dto.entityId) {
      throw new BadRequestException('entityType and entityId are required.');
    }
    return this.barcodesService.generateBarcodePayload(
      dto.entityType,
      dto.entityId,
    );
  }

  @Post('batch-labels')
  getBatchLabels(@Body() dto: BatchLabelsDto) {
    if (!dto.entityType || !Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException(
        'entityType and non-empty ids array are required.',
      );
    }
    return this.barcodesService.getBatchLabels(dto.entityType, dto.ids);
  }
}
