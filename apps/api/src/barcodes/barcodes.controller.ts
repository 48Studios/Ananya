import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsIn,
} from 'class-validator';
import {
  BarcodesService,
  type EntityType,
  ENTITY_TYPES,
} from './barcodes.service';

export class GenerateBarcodeDto {
  @IsIn(ENTITY_TYPES, {
    message:
      'entityType must be one of: COMPONENT, LOCATION, WORK_ORDER, PURCHASE_ORDER, PROJECT',
  })
  @IsNotEmpty()
  entityType!: EntityType;

  @IsString()
  @IsNotEmpty()
  entityId!: string;
}

export class BatchLabelsDto {
  @IsIn(ENTITY_TYPES, {
    message:
      'entityType must be one of: COMPONENT, LOCATION, WORK_ORDER, PURCHASE_ORDER, PROJECT',
  })
  @IsNotEmpty()
  entityType!: EntityType;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}

export class BarcodeLookupQueryDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

@Controller('barcodes')
export class BarcodesController {
  constructor(private readonly barcodesService: BarcodesService) {}

  @Get('lookup')
  lookup(@Query() query: BarcodeLookupQueryDto) {
    return this.barcodesService.lookup(query.code);
  }

  @Post('generate')
  generate(@Body() dto: GenerateBarcodeDto) {
    return this.barcodesService.generateBarcodePayload(
      dto.entityType,
      dto.entityId,
    );
  }

  @Post('batch-labels')
  getBatchLabels(@Body() dto: BatchLabelsDto) {
    return this.barcodesService.getBatchLabels(dto.entityType, dto.ids);
  }
}
